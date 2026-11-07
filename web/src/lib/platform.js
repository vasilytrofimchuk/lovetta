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
  if (platform === 'android') return false

  if (!isCapacitor()) return false

  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  const hasIosBridge = !!window.webkit?.messageHandlers
  return /lovetta-ios/i.test(userAgent) || (hasIosBridge && /iPhone|iPad|iPod/i.test(userAgent))
}

/** True inside the Android app (Google Play build). */
export function isAndroid() {
  if (capacitorPlatform() === 'android') return true
  if (!isCapacitor()) return false
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  return /lovetta-android/i.test(userAgent)
}

/**
 * Native push works only in the iOS app: the Android app has no Firebase project yet
 * (google-services.json), and PushNotifications.register() crashes the app without it.
 */
export function hasNativePush() {
  return isCapacitor() && !isAndroid()
}

/** Sign in with Apple: iOS app only (on Android it would be a web flow we do not support). */
export function hasAppleSignIn() {
  return isCapacitor() && !isAndroid()
}

/**
 * Google sign-in on Android needs an Android OAuth client (package + SHA-1) in Google Cloud.
 * Until it exists the button is hidden there; set VITE_GOOGLE_ANDROID_SIGNIN=1 in the build env to show it.
 */
export function hasGoogleSignIn() {
  if (!isAndroid()) return true
  return import.meta.env.VITE_GOOGLE_ANDROID_SIGNIN === '1'
}

/** True when running inside a native app store build (Capacitor). */
export function isAppStore() {
  return isCapacitor()
}
