import Foundation

actor APIClient {
    private let configuration: AppConfiguration
    private let credentials: any CredentialStore
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var refreshTask: Task<TokenPair, Error>?

    init(
        configuration: AppConfiguration,
        credentials: any CredentialStore,
        session _: URLSession,
        urlProtocolClasses: [AnyClass]?
    ) {
        self.configuration = configuration
        self.credentials = credentials
        let delegate = PinnedSessionDelegate(allowedPins: configuration.certificatePins)
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Infy-Client": "ios"
        ]
        config.urlCache = URLCache(
            memoryCapacity: 16 * 1_024 * 1_024,
            diskCapacity: 128 * 1_024 * 1_024,
            directory: nil
        )
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.protocolClasses = urlProtocolClasses
        self.session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(Self.decodeInfyDate)
        self.decoder = decoder
    }

    func send<Response>(_ endpoint: APIEndpoint<Response>) async throws -> Response {
        let request = try await makeRequest(endpoint)
        do {
            return try await perform(request, responseType: Response.self)
        } catch APIClientError.unauthorized where endpoint.requiresAuthorization {
            _ = try await refreshTokens()
            let retry = try await makeRequest(endpoint)
            return try await perform(retry, responseType: Response.self)
        }
    }

    func sendVoid(_ endpoint: APIEndpoint<EmptyPayload>) async throws {
        let request = try await makeRequest(endpoint)
        do {
            try await performVoid(request)
        } catch APIClientError.unauthorized where endpoint.requiresAuthorization {
            _ = try await refreshTokens()
            let retry = try await makeRequest(endpoint)
            try await performVoid(retry)
        }
    }

    private func makeRequest<Response>(_ endpoint: APIEndpoint<Response>) async throws -> URLRequest {
        guard let url = URL(string: endpoint.path, relativeTo: configuration.apiBaseURL) else {
            throw APIClientError.invalidURL(endpoint.path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Infy-iOS/0.1", forHTTPHeaderField: "User-Agent")

        if endpoint.requiresAuthorization, let token = try await credentials.loadTokenPair()?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = endpoint.body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        return request
    }

    private func perform<Response>(_ request: URLRequest, responseType: Response.Type) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        let status = try httpStatus(from: response)

        switch status {
        case 200..<300:
            if responseType == EmptyPayload.self {
                return EmptyPayload() as! Response
            }
            return try decoder.decode(APIEnvelope<Response>.self, from: data).data
        case 401:
            throw APIClientError.unauthorized
        default:
            throw decodeServerError(from: data, statusCode: status)
        }
    }

    private func performVoid(_ request: URLRequest) async throws {
        let (data, response) = try await session.data(for: request)
        let status = try httpStatus(from: response)

        switch status {
        case 200..<300:
            return
        case 401:
            throw APIClientError.unauthorized
        default:
            throw decodeServerError(from: data, statusCode: status)
        }
    }

    private func refreshTokens() async throws -> TokenPair {
        if let refreshTask {
            return try await refreshTask.value
        }

        let task = Task<TokenPair, Error> {
            guard let current = try await credentials.loadTokenPair() else {
                throw APIClientError.missingRefreshToken
            }

            let response: TokenRefreshResponse = try await send(
                APIEndpoint<TokenRefreshResponse>(
                    method: .post,
                    path: "/auth/refresh",
                    body: TokenRefreshRequest(refreshToken: current.refreshToken),
                    requiresAuthorization: false
                )
            )
            let pair = TokenPair(accessToken: response.accessToken, refreshToken: response.refreshToken)
            try await credentials.saveTokenPair(pair)
            return pair
        }

        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func httpStatus(from response: URLResponse) throws -> Int {
        guard let response = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        return response.statusCode
    }

    private func decodeServerError(from data: Data, statusCode: Int) -> APIClientError {
        if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
            return .server(code: envelope.error.code, message: envelope.error.message, statusCode: statusCode)
        }
        return .server(code: "HTTP_\(statusCode)", message: "Unexpected server response", statusCode: statusCode)
    }

    private static func decodeInfyDate(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)

        if let date = DateFormatter.infyFractionalISO.date(from: value) {
            return date
        }
        if let date = DateFormatter.infyISO.date(from: value) {
            return date
        }
        if let date = DateFormatter.infyDateOnly.date(from: value) {
            return date
        }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(value)")
    }
}

private struct AnyEncodable: Encodable {
    let encodeBody: (Encoder) throws -> Void

    init(_ base: any Encodable) {
        encodeBody = base.encode(to:)
    }

    func encode(to encoder: Encoder) throws {
        try encodeBody(encoder)
    }
}

private struct TokenRefreshRequest: Codable, Sendable {
    let refreshToken: String
}

private struct TokenRefreshResponse: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
}

private extension DateFormatter {
    static let infyFractionalISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let infyISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let infyDateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
