import UIKit
import Capacitor
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if DEBUG
        if #available(iOS 15.0, *) {
            Task {
                await debugStoreKitProducts()
            }
        }
        #endif
        return true
    }

    @available(iOS 15.0, *)
    private func debugStoreKitProducts() async {
        let ids = Set([
            "monthly",
            "yearly",
            "lovetta_monthly",
            "lovetta_yearly",
            "tip_999",
            "tip_1999",
            "tip_4999",
            "tip_9999",
            "lovetta_tip_999",
            "lovetta_tip_1999",
            "lovetta_tip_4999",
            "lovetta_tip_9999",
        ])

        print("[StoreKit Debug] Fetching products: \(Array(ids).sorted())")
        do {
            let products = try await Product.products(for: ids)
            print("[StoreKit Debug] Found \(products.count) products")
            for product in products {
                print("[StoreKit Debug] \(product.id) — \(product.displayName) — \(product.displayPrice)")
            }
            if products.isEmpty {
                print("[StoreKit Debug] 0 products returned. Check:")
                print("[StoreKit Debug] 1. When testing locally from Xcode, the App scheme has Lovetta.storekit attached")
                print("[StoreKit Debug] 2. App Store Connect product IDs match exactly")
                print("[StoreKit Debug] 3. In-App Purchase is enabled for ai.lovetta.app")
                print("[StoreKit Debug] 4. Paid Applications agreement is signed")
                print("[StoreKit Debug] 5. Device is using Sandbox Apple Account in Settings > Developer when testing real Apple sandbox")
            }
        } catch {
            print("[StoreKit Debug] Error fetching products: \(error.localizedDescription)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {
        application.applicationIconBadgeNumber = 0
    }
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
