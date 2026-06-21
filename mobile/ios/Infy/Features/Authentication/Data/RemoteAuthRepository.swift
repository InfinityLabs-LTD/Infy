import Foundation

actor RemoteAuthRepository: AuthRepository {
    private let apiClient: APIClient
    private let credentials: any CredentialStore

    init(apiClient: APIClient, credentials: any CredentialStore) {
        self.apiClient = apiClient
        self.credentials = credentials
    }

    func login(username: String, password: String) async throws -> AuthSession {
        let session: AuthSession = try await apiClient.send(
            APIEndpoint<AuthSession>(
                method: .post,
                path: "/auth/login",
                body: LoginRequest(username: username, password: password),
                requiresAuthorization: false
            )
        )
        try await credentials.saveTokenPair(TokenPair(accessToken: session.accessToken, refreshToken: session.refreshToken))
        return session
    }

    func register(
        username: String,
        nickname: String,
        password: String,
        email: String?,
        birthdate: String?
    ) async throws -> AuthSession {
        let session: AuthSession = try await apiClient.send(
            APIEndpoint<AuthSession>(
                method: .post,
                path: "/auth/register",
                body: RegisterRequest(
                    username: username,
                    nickname: nickname,
                    password: password,
                    email: email?.nilIfBlank,
                    birthdate: birthdate?.nilIfBlank
                ),
                requiresAuthorization: false
            )
        )
        try await credentials.saveTokenPair(TokenPair(accessToken: session.accessToken, refreshToken: session.refreshToken))
        return session
    }

    func forgotPassword(email: String) async throws {
        try await apiClient.sendVoid(
            APIEndpoint<EmptyPayload>(
                method: .post,
                path: "/auth/forgot-password",
                body: ForgotPasswordRequest(email: email),
                requiresAuthorization: false
            )
        )
    }

    func validateResetToken(_ token: String) async throws -> ResetPasswordValidation {
        try await apiClient.send(
            APIEndpoint<ResetPasswordValidation>(
                method: .get,
                path: "/auth/reset-password/\(token)",
                requiresAuthorization: false
            )
        )
    }

    func resetPassword(token: String, password: String) async throws {
        try await apiClient.sendVoid(
            APIEndpoint<EmptyPayload>(
                method: .post,
                path: "/auth/reset-password",
                body: ResetPasswordRequest(token: token, password: password),
                requiresAuthorization: false
            )
        )
    }

    func logout() async throws {
        do {
            try await apiClient.sendVoid(APIEndpoint<EmptyPayload>(method: .post, path: "/auth/logout"))
            try await credentials.clearTokenPair()
        } catch {
            try await credentials.clearTokenPair()
            throw error
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
