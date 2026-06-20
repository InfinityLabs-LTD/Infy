import SwiftUI
import UIKit

struct AuthTextField: View {
    let title: LocalizedStringKey
    let systemImage: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType?
    var autocapitalization: TextInputAutocapitalization = .never

    var body: some View {
        Label {
            TextField(title, text: $text)
                .keyboardType(keyboardType)
                .textContentType(textContentType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled()
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.white.opacity(0.75))
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .foregroundStyle(.white)
    }
}

struct AuthSecureField: View {
    let title: LocalizedStringKey
    @Binding var text: String

    var body: some View {
        Label {
            SecureField(title, text: $text)
                .textContentType(.password)
        } icon: {
            Image(systemName: "lock.fill")
                .foregroundStyle(.white.opacity(0.75))
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .foregroundStyle(.white)
    }
}

struct AuthMessageView: View {
    let message: String
    let isError: Bool

    var body: some View {
        Text(message)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(isError ? InfyTheme.destructive : InfyTheme.success)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}
