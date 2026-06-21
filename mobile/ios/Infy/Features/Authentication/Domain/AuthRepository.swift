import Foundation

protocol AuthRepository: Sendable {
    func login(username: String, password: String) async throws -> AuthSession
    func register(username: String, nickname: String, password: String, email: String?, birthdate: String?) async throws -> AuthSession
    func forgotPassword(email: String) async throws
    func validateResetToken(_ token: String) async throws -> ResetPasswordValidation
    func resetPassword(token: String, password: String) async throws
    func logout() async throws
}

