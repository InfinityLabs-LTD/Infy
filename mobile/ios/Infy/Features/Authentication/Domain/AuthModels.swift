import Foundation

struct AuthSession: Codable, Equatable, Sendable {
    let user: User
    let accessToken: String
    let refreshToken: String
    let sessionId: String
}

struct LoginRequest: Codable, Sendable {
    let username: String
    let password: String
}

struct RegisterRequest: Codable, Sendable {
    let username: String
    let nickname: String
    let password: String
    let email: String?
    let birthdate: String?
}

struct ForgotPasswordRequest: Codable, Sendable {
    let email: String
}

struct ResetPasswordRequest: Codable, Sendable {
    let token: String
    let password: String
}

struct ResetPasswordValidation: Codable, Equatable, Sendable {
    struct UserSummary: Codable, Equatable, Sendable {
        let username: String
        let nickname: String
    }

    let valid: Bool
    let user: UserSummary?
}
