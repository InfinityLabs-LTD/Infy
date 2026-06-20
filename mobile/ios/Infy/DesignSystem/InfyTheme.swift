import SwiftUI

enum InfyTheme {
    static let violet = Color(red: 0.53, green: 0.25, blue: 0.96)
    static let pink = Color(red: 0.90, green: 0.27, blue: 0.73)
    static let indigo = Color(red: 0.25, green: 0.22, blue: 0.72)
    static let ink = Color(red: 0.08, green: 0.07, blue: 0.13)
    static let success = Color(red: 0.20, green: 0.78, blue: 0.52)
    static let destructive = Color(red: 0.95, green: 0.25, blue: 0.32)
}

struct InfyGradientBackground: View {
    var body: some View {
        LinearGradient(
            colors: [InfyTheme.indigo, InfyTheme.violet, InfyTheme.pink],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct InfyGlassPanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .padding(20)
                .glassEffect(.regular.tint(.white.opacity(0.14)), in: .rect(cornerRadius: 28))
        } else {
            content
                .padding(20)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }
        }
    }
}

extension View {
    func infyGlassPanel() -> some View {
        modifier(InfyGlassPanelModifier())
    }
}

struct InfyPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                LinearGradient(
                    colors: [InfyTheme.violet, InfyTheme.pink],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.smooth(duration: 0.18), value: configuration.isPressed)
    }
}

