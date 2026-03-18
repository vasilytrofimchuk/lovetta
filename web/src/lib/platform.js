/** Platform detection utilities for Capacitor / App Store builds. */

function capacitorPlatform() {
  return window.Capacitor?.getPlatform?.()
}

export function isCapacitor() {
  const platform = capacitorPlatform()
  if (platform && platform !== 'web') return true
  return !!window.Capacitor?.isNativePlatform?.()
}

export function isIOS() {
  const platform = capacitorPlatform()
  if (platform === 'ios') return true

  if (!isCapacitor()) return false

  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  const hasIosBridge = !!window.webkit?.messageHandlers
  return /lovetta-ios/i.test(userAgent) || (hasIosBridge && /iPhone|iPad|iPod/i.test(userAgent))
}

/** True when running inside a native app store build (Capacitor). */
export function isAppStore() {
  return isCapacitor()
}
