/**
 * Server-side device type classification from User-Agent and client hints.
 *
 * Returns one of: 'ios', 'android', 'web-mobile', 'web-tablet', 'web-desktop'.
 * The native Capacitor app sends a `lovetta-ios` / `lovetta-android` token in
 * the UA (added in `web/capacitor.config.json`); the web app passes a
 * `deviceType` hint in the signup body.
 */

function classifyDevice(userAgent, clientHint) {
  const ua = (userAgent || '').toLowerCase();

  if (ua.includes('lovetta-ios') || ua.includes('capacitor-ios')) return 'ios';
  if (ua.includes('lovetta-android') || ua.includes('capacitor-android')) return 'android';

  const hint = (clientHint || '').toLowerCase();
  if (hint === 'ios' || hint === 'android') return hint;

  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/.test(ua)) return 'web-tablet';
  if (/mobile|android|ip(hone|od)|iemobile|blackberry|opera mini/.test(ua)) return 'web-mobile';

  if (hint === 'tablet') return 'web-tablet';
  if (hint === 'mobile') return 'web-mobile';

  return 'web-desktop';
}

module.exports = { classifyDevice };
