import Foundation
import UIKit
import Capacitor

@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCurrentIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
    ]

    private let iconMap: [String: String?] = [
        "default": nil,
        "black": "AppIconBlack",
        "silver": "AppIconSilver",
    ]

    private let reverseMap: [String: String] = [
        "AppIconBlack": "black",
        "AppIconSilver": "silver",
    ]

    @objc public func getCurrentIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "icon": self.currentIconId(),
            ])
        }
    }

    @objc public func setIcon(_ call: CAPPluginCall) {
        let requestedIcon = (call.getString("icon") ?? "default").lowercased()

        guard let alternateName = iconMap[requestedIcon] else {
            call.reject("Unsupported app icon: \(requestedIcon)")
            return
        }

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Alternate app icons are not supported on this device.")
                return
            }

            UIApplication.shared.setAlternateIconName(alternateName) { error in
                if let error = error {
                    call.reject("Failed to update app icon: \(error.localizedDescription)")
                    return
                }

                call.resolve([
                    "icon": self.currentIconId(),
                ])
            }
        }
    }

    private func currentIconId() -> String {
        let alternateName = UIApplication.shared.alternateIconName ?? ""
        return reverseMap[alternateName] ?? "default"
    }
}
