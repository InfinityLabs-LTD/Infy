import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    var body: some View {
        Group {
            switch appEnvironment.session.phase {
            case .loading:
                LaunchLoadingView()
            case .authenticated:
                AuthenticatedPlaceholderView()
            case .signedOut:
                AuthenticationRootView()
            }
        }
        .task {
            await appEnvironment.session.bootstrap()
        }
    }
}

private struct LaunchLoadingView: View {
    var body: some View {
        ZStack {
            InfyGradientBackground()
            ProgressView()
                .controlSize(.large)
                .tint(.white)
                .accessibilityLabel("Loading account")
        }
    }
}

private struct AuthenticatedPlaceholderView: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    var body: some View {
        NavigationStack {
            ZStack {
                InfyGradientBackground()
                VStack(spacing: 16) {
                    Image(systemName: "message.badge.waveform.fill")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(.white)
                    Text("Infy")
                        .font(.largeTitle.bold())
                        .foregroundStyle(.white)
                    Text(appEnvironment.session.currentUser?.nickname ?? "Account is ready")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.82))
                    Button("Sign Out") {
                        Task { await appEnvironment.session.signOut() }
                    }
                    .buttonStyle(InfyPrimaryButtonStyle())
                    .padding(.top, 12)
                }
                .padding(24)
                .infyGlassPanel()
                .padding(24)
            }
            .navigationTitle("Infy")
        }
    }
}

