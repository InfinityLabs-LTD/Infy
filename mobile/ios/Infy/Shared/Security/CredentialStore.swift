import Foundation

struct TokenPair: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
}

protocol CredentialStore: Sendable {
    func saveTokenPair(_ pair: TokenPair) async throws
    func loadTokenPair() async throws -> TokenPair?
    func clearTokenPair() async throws
}

