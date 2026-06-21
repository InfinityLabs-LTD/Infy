import Foundation

struct APIEnvelope<Payload: Decodable>: Decodable {
    let data: Payload
}

struct APIErrorEnvelope: Decodable {
    let error: APIErrorBody
}

struct APIErrorBody: Decodable, Equatable, Sendable {
    let code: String
    let message: String
}

struct EmptyPayload: Decodable, Sendable {}

