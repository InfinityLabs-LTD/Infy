import Foundation

enum APIClientError: LocalizedError, Equatable, Sendable {
    case invalidURL(String)
    case invalidResponse
    case unauthorized
    case missingRefreshToken
    case server(code: String, message: String, statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Invalid request URL"
        case .invalidResponse:
            "Invalid server response"
        case .unauthorized:
            "Session expired"
        case .missingRefreshToken:
            "Sign in again to continue"
        case .server(_, let message, _):
            message
        }
    }
}

