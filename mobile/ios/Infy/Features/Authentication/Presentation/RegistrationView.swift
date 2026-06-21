import SwiftUI

struct RegistrationView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var username = ""
    @State private var nickname = ""
    @State private var email = ""
    @State private var birthdate = ""
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 14) {
            AuthTextField(title: "Username", systemImage: "at", text: $username, textContentType: .username)
            AuthTextField(
                title: "Nickname",
                systemImage: "person.text.rectangle.fill",
                text: $nickname,
                textContentType: .nickname,
                autocapitalization: .words
            )
            AuthTextField(title: "Email", systemImage: "envelope.fill", text: $email, keyboardType: .emailAddress, textContentType: .emailAddress)
            AuthTextField(title: "Birthdate YYYY-MM-DD", systemImage: "calendar", text: $birthdate, keyboardType: .numbersAndPunctuation)
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
                    Text("Create Account")
                }
            }
            .buttonStyle(InfyPrimaryButtonStyle())
            .disabled(!canSubmit || isSubmitting)
            .opacity(canSubmit ? 1 : 0.55)
        }
        .infyGlassPanel()
    }

    private var canSubmit: Bool {
        username.range(of: #"^[a-z0-9_]{3,32}$"#, options: .regularExpression) != nil &&
        nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false &&
        password.count >= 8 &&
        (birthdate.isEmpty || birthdate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil)
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        await appEnvironment.session.register(
            username: username.lowercased(),
            nickname: nickname,
            password: password,
            email: email,
            birthdate: birthdate
        )
    }
}

