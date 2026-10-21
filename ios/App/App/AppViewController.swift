import UIKit
import Capacitor

/// The bridge's view controller, so the app's own plugins can be registered:
/// Capacitor only registers the ones it finds in npm packages by itself.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ThermalPlugin())
    }
}
