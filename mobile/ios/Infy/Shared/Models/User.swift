import Foundation

struct User: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let username: String
    let nickname: String
    let avatarUrl: URL?
    let coverUrl: URL?
    let bio: String?
    let role: String
    let email: String?
    let emailVerified: Bool
    let birthdate: Date?
    let timezone: String?
    let aiSuggestReplies: Bool
    let notifyPopup: Bool
    let notifySound: Bool
    let notifyVibrate: Bool
    let interests: [String]
    let badges: [UserBadge]
    let createdAt: Date
    let lastSeenAt: Date
}

struct UserBadge: Codable, Equatable, Sendable {
    let slug: String
    let label: String
    let color: String
    let icon: String
    let description: String?
}

