import SwiftUI

struct AuthenticationRootView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Вход"
        case register = "Регистрация"
        case recover = "Доступ"

        var id: String { rawValue }
    }

    @State private var mode: Mode = .signIn

    var body: some View {
        ZStack {
            InfyGradientBackground()
            ScrollView {
                VStack(spacing: 24) {
                    AuthHeaderView()
                    Picker("Auth Mode", selection: $mode) {
                        ForEach(Mode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel("Authentication mode")

                    Group {
                        switch mode {
                        case .signIn:
                            SignInView()
                        case .register:
                            RegistrationView()
                        case .recover:
                            PasswordRecoveryView()
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 36)
            }
        }
    }
}

private struct AuthHeaderView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(.white)
            Text("Infy")
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text("Secure messaging, calls, AI and events in one native client.")
                .font(.headline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 18)
    }
}

