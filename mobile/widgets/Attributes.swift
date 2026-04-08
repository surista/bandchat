// Attributes.swift — Placeholder required by react-native-widget-extension.
// No Live Activity used; only static widgets.
import Foundation

#if canImport(ActivityKit)
import ActivityKit

struct BandChatWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var dummy: Bool = false
    }
}
#endif
