import ExpoModulesCore
import WidgetKit

public class WidgetBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WidgetBridge")

        Function("updateWidgetData") { (jsonString: String) in
            guard let defaults = UserDefaults(suiteName: "group.com.bandchat.manager.mobile") else {
                return
            }
            defaults.set(jsonString, forKey: "nextGigData")
            defaults.set(Date(), forKey: "nextGigUpdatedAt")
            defaults.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }

        Function("reloadWidgets") {
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
