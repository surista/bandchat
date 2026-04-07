import Foundation

struct GigPayload: Codable {
    let gigId: String
    let workspaceId: String
    let title: String
    let date: String
    let endDate: String?
    let venue: String?
    let type: String
    let attendanceStatus: String?
    let workspaceName: String?
    let soundCheckTime: String?
    let eventStartTime: String?
    let performanceStartTime: String?
}

struct SharedGigData {
    static let appGroupId = "group.com.bandchat.manager.mobile"
    static let gigDataKey = "nextGigData"

    static func load() -> GigPayload? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let jsonString = defaults.string(forKey: gigDataKey),
              jsonString != "null",
              let jsonData = jsonString.data(using: .utf8)
        else {
            return nil
        }

        return try? JSONDecoder().decode(GigPayload.self, from: jsonData)
    }

    static func lastUpdated() -> Date? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        return defaults.object(forKey: "nextGigUpdatedAt") as? Date
    }
}
