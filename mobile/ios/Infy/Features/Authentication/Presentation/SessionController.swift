import Foundation
import Observation

@MainActor
@Observable
final class SessionController {
    enum Phase: Equatable {
        case loading
        case signedOut
        case authenticated
    }

    private let authRepository: any AuthRepository
    private let credentials: any CredentialStore

    private(set) var phase: Phase = .loading
    private(set) var currentUser: User?
    private(set) var lastErrorMessage: String?

    init(authRepository: any AuthRepository, credentials: any CredentialStore) {
        self.authRepository = authRepository
        self.credentials = credentials
    }

    func bootstrap() async {
        do {
            if try await credentials.loadTokenPair() != nil {
                phase = .authenticated
            } else {
                phase = .signedOut
            }
        } catch {
            lastErrorMessage = error.localizedDescription
            phase = .signedOut
        }
    }

    func signIn(username: String, password: String) async {
        await performAuthAction {
            try await authRepository.login(username: username, password: password)
        }
    }

    func register(username: String, nickname: String, password: String, email: String?, birthdate: String?) async {
        await performAuthAction {
            try await authRepository.register(
                username: username,
                nickname: nickname,
                password: password,
                email: email,
                birthdate: birthdate
            )
        }
    }

    func signOut() async {
        phase = .loading
        do {
            try await authRepository.logout()
            currentUser = nil
            phase = .signedOut
        } catch {
            try? await credentials.clearTokenPair()
            currentUser = nil
            lastErrorMessage = error.localizedDescription
            phase = .signedOut
        }
    }

    func forgotPassword(email: String) async throws {
        try await authRepository.forgotPassword(email: email)
    }

    private func performAuthAction(_ action: @escaping @Sendable () async throws -> AuthSession) async {
        phase = .loading
        lastErrorMessage = nil
        do {
            let session = try await action()
            currentUser = session.user
            phase = .authenticated
        } catch {
            lastErrorMessage = error.localizedDescription
            phase = .signedOut
        }
    }
}
