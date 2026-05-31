/**
 * Server-side device type classification from User-Agent and client hints.
 *
 * Returns one of: 'ios', 'android', 'web-mobile', 'web-tablet', 'web-desktop'.
 * The native Capacitor app sends a `lovetta-ios` / `lovetta-android` token in
 * the UA (added in `web/capacitor.config.json`); the web app passes a
 * `deviceType` hint in the signup body.
 */

function classifyDevice(userAgent, clientHint, platformHeader) {
  const ua = (userAgent || '').toLowerCase();

  // Highest-fidelity signal: explicit X-Lovetta-Platform header from the
  // Capacitor client (web/src/lib/api.js sets this on every request when
  // isCapacitor() is true). This is the bulletproof path — UA hints can be
  // overridden by webviews and were observed to never reach the server
  // for native iOS (0/862 users showed 'lovetta-ios' UA despite 83
  // RevenueCat subs).
  const platform = (platformHeader || '').toLowerCase();
  if (platform === 'ios-native' || platform === 'ios') return 'ios';
  if (platform === 'android-native' || platform === 'android') return 'android';

  if (ua.includes('lovetta-ios') || ua.includes('capacitor-ios')) return 'ios';
  if (ua.includes('lovetta-android') || ua.includes('capacitor-android')) return 'android';

  const hint = (clientHint || '').toLowerCase();
  if (hint === 'ios' || hint === 'android') return hint;

  // Heuristic fallback for native iOS WKWebview where appendUserAgent
  // failed to propagate: iPhone/iPad UA without 'Safari/' or 'CriOS/'
  // strongly implies in-app WebKit (Capacitor, in-app browser, etc).
  if (/iphone|ipad|ipod/.test(ua) && !/safari\//.test(ua) && !/crios\//.test(ua) && !/fxios\//.test(ua)) {
    return 'ios';
  }

  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/.test(ua)) return 'web-tablet';
  if (/mobile|android|ip(hone|od)|iemobile|blackberry|opera mini/.test(ua)) return 'web-mobile';

  if (hint === 'tablet') return 'web-tablet';
  if (hint === 'mobile') return 'web-mobile';

  return 'web-desktop';
}

module.exports = { classifyDevice };
