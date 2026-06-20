import Foundation

struct AppConfiguration: Sendable {
    let apiBaseURL: URL
    let realtimeURL: URL
    let certificatePins: Set<String>

    static func fromBundle(_ bundle: Bundle = .main) -> AppConfiguration {
        let apiBase = bundle.string(forInfoDictionaryKey: "INFY_API_BASE_URL")
        let realtime = bundle.string(forInfoDictionaryKey: "INFY_REALTIME_URL")
        let pins = bundle.string(forInfoDictionaryKey: "INFY_CERTIFICATE_PINS") ?? ""

        guard
            let apiBase,
            let apiBaseURL = URL(string: apiBase),
            let realtime,
            let realtimeURL = URL(string: realtime)
        else {
            preconditionFailure("Infy configuration is missing or invalid")
        }

        return AppConfiguration(
            apiBaseURL: apiBaseURL,
            realtimeURL: realtimeURL,
            certificatePins: Set(
                pins
                    .split(separator: ",")
                    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        )
    }
}

