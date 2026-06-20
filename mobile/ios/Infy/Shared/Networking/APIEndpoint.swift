import Foundation

struct APIEndpoint<Response: Decodable>: Sendable {
    enum Method: String, Sendable {
        case get = "GET"
        case post = "POST"
        case put = "PUT"
        case patch = "PATCH"
        case delete = "DELETE"
    }

    let method: Method
    let path: String
    let body: (any Encodable & Sendable)?
    let requiresAuthorization: Bool

    init(
        method: Method,
        path: String,
        body: (any Encodable & Sendable)? = nil,
        requiresAuthorization: Bool = true
    ) {
        self.method = method
        self.path = path
        self.body = body
        self.requiresAuthorization = requiresAuthorization
    }
}

