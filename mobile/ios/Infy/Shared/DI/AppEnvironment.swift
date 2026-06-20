import Foundation
import Observation

@MainActor
@Observable
final class AppEnvironment {
    let configuration: AppConfiguration
    let apiClient: APIClient
    let credentials: any CredentialStore
    let authRepository: any AuthRepository
    let session: SessionController

    init(
        configuration: AppConfiguration,
        apiClient: APIClient,
        credentials: any CredentialStore,
        authRepository: any AuthRepository,
        session: SessionController
    ) {
        self.configuration = configuration
        self.apiClient = apiClient
        self.credentials = credentials
        self.authRepository = authRepository
        self.session = session
    }

    static func live() -> AppEnvironment {
        let configuration = AppConfiguration.fromBundle()
        let credentials = KeychainCredentialStore(service: "ru.infy.messenger.credentials")
        let apiClient = APIClient(
            configuration: configuration,
            credentials: credentials,
            session: .shared,
            urlProtocolClasses: nil
        )
        let authRepository = RemoteAuthRepository(apiClient: apiClient, credentials: credentials)
        let session = SessionController(authRepository: authRepository, credentials: credentials)

        return AppEnvironment(
            configuration: configuration,
            apiClient: apiClient,
            credentials: credentials,
            authRepository: authRepository,
            session: session
        )
    }
}
