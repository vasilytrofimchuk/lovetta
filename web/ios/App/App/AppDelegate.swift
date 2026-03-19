import UIKit
import Capacitor
import WebKit
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var loadingOverlay: UIView?
    private var webViewObservation: NSKeyValueObservation?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // Schedule overlay addition after the root VC is set up
        DispatchQueue.main.async { [weak self] in
            self?.addLoadingOverlay()
            self?.observeWebView()
        }

        #if DEBUG
        if #available(iOS 15.0, *) {
            Task {
                await debugStoreKitProducts()
            }
        }
        #endif
        return true
    }

    private func addLoadingOverlay() {
        guard let rootView = window?.rootViewController?.view else { return }

        let brandBg = UIColor(red: 0.059, green: 0.039, blue: 0.102, alpha: 1.0) // #0f0a1a

        // Set WebView background
        if let vc = window?.rootViewController as? CAPBridgeViewController {
            vc.view.backgroundColor = brandBg
            vc.webView?.isOpaque = false
            vc.webView?.backgroundColor = brandBg
            vc.webView?.scrollView.backgroundColor = brandBg
        }

        let overlay = UIView(frame: rootView.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = brandBg
        overlay.tag = 9999

        // App icon
        if let iconImage = UIImage(named: "LaunchIcon") {
            let iconView = UIImageView(image: iconImage)
            iconView.contentMode = .scaleAspectFit
            iconView.translatesAutoresizingMaskIntoConstraints = false
            iconView.layer.cornerRadius = 18
            iconView.clipsToBounds = true
            overlay.addSubview(iconView)

            NSLayoutConstraint.activate([
                iconView.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                iconView.centerYAnchor.constraint(equalTo: overlay.centerYAnchor, constant: -20),
                iconView.widthAnchor.constraint(equalToConstant: 80),
                iconView.heightAnchor.constraint(equalToConstant: 80),
            ])
        }

        // Spinner
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = UIColor(red: 0.839, green: 0.200, blue: 0.424, alpha: 1.0) // #d6336c
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        overlay.addSubview(spinner)

        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: overlay.centerYAnchor, constant: 50),
        ])

        rootView.addSubview(overlay)
        loadingOverlay = overlay
    }

    private func observeWebView() {
        guard let vc = window?.rootViewController as? CAPBridgeViewController,
              let webView = vc.webView else { return }

        webViewObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] webView, change in
            if let isLoading = change.newValue, !isLoading {
                DispatchQueue.main.async {
                    self?.hideLoadingOverlay()
                }
            }
        }
    }

    private func hideLoadingOverlay() {
        guard let overlay = loadingOverlay else { return }
        webViewObservation?.invalidate()
        webViewObservation = nil

        UIView.animate(withDuration: 0.3, animations: {
            overlay.alpha = 0
        }) { _ in
            overlay.removeFromSuperview()
        }
        loadingOverlay = nil
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
