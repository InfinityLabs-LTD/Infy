import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var username = ""
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 14) {
            AuthTextField(title: "Username", systemImage: "person.fill", text: $username, textContentType: .username)
            AuthSecureField(title: "Password", text: $password)

            if let error = appEnvironment.session.lastErrorMessage {
                AuthMessageView(message: error, isError: true)
            }

            Button {
                Task { await submit() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Sign In")
                }
            }
            .buttonStyle(InfyPrimaryButtonStyle())
            .disabled(!canSubmit || isSubmitting)
            .opacity(canSubmit ? 1 : 0.55)
        }
        .infyGlassPanel()
    }

    private var canSubmit: Bool {
        username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && password.isEmpty == false
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        await appEnvironment.session.signIn(username: username.lowercased(), password: password)
    }
}

