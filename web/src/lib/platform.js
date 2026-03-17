/** Platform detection utilities for Capacitor / App Store builds. */

export function isCapacitor() {
  return !!(window.Capacitor?.isNativePlatform?.())
}

export function isIOS() {
  return isCapacitor() && window.Capacitor?.getPlatform?.() === 'ios'
}

/** True when running inside a native app store build (Capacitor). */
export function isAppStore() {
  return isCapacitor()
}
