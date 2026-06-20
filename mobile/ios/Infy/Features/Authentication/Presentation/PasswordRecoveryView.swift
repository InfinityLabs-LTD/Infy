import SwiftUI

struct PasswordRecoveryView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var email = ""
    @State private var message: String?
    @State private var error: String?
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 14) {
            AuthTextField(title: "Email", systemImage: "envelope.fill", text: $email, keyboardType: .emailAddress, textContentType: .emailAddress)

            if let message {
                AuthMessageView(message: message, isError: false)
            }
            if let error {
                AuthMessageView(message: error, isError: true)
            }

            Button {
                Task { await submit() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Send Reset Link")
                }
            }
            .buttonStyle(InfyPrimaryButtonStyle())
            .disabled(!canSubmit || isSubmitting)
            .opacity(canSubmit ? 1 : 0.55)
        }
        .infyGlassPanel()
    }

    private var canSubmit: Bool {
        email.contains("@") && email.contains(".")
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        message = nil
        error = nil
        defer { isSubmitting = false }

        do {
            try await appEnvironment.session.forgotPassword(email: email)
            message = "If the email is verified, Infy will send a reset link."
        } catch {
            self.error = error.localizedDescription
        }
    }
}

