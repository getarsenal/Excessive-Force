import Foundation
import UIKit
import Capacitor

/// What the web cannot see and the phone knows: how hot it is running, whether
/// Low Power Mode is on, and the battery. The game's heat governor
/// (src/core/heat.js) listens and turns the picture down before iOS has to
/// throttle the whole phone.
///
/// Thermal state is ProcessInfo.thermalState: nominal, fair, serious, critical.
/// Apple's own guidance for each: fair, reduce background work; serious, cut
/// frame rate and resolution; critical, the minimum that keeps the app usable.
@objc(ThermalPlugin)
public class ThermalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThermalPlugin"
    public let jsName = "Thermal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(changed), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
        nc.addObserver(self, selector: #selector(changed), name: .NSProcessInfoPowerStateDidChange, object: nil)
        nc.addObserver(self, selector: #selector(changed), name: UIDevice.batteryLevelDidChangeNotification, object: nil)
        nc.addObserver(self, selector: #selector(changed), name: UIDevice.batteryStateDidChangeNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func changed() {
        notifyListeners("change", data: snapshot())
    }

    @objc public func state(_ call: CAPPluginCall) {
        call.resolve(snapshot())
    }

    private func snapshot() -> [String: Any] {
        let thermal: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = "nominal"
        case .fair: thermal = "fair"
        case .serious: thermal = "serious"
        case .critical: thermal = "critical"
        @unknown default: thermal = "nominal"
        }
        let dev = UIDevice.current
        let battery: String
        switch dev.batteryState {
        case .charging: battery = "charging"
        case .full: battery = "full"
        case .unplugged: battery = "unplugged"
        default: battery = "unknown"
        }
        return [
            "thermal": thermal,
            "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "batteryLevel": dev.batteryLevel < 0 ? NSNull() : Double(dev.batteryLevel),
            "batteryState": battery,
        ]
    }
}
