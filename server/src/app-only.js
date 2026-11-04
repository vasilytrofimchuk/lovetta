/**
 * The web app at /my/ exists only for the iOS app (owner decision 2026-11-04).
 *
 * The iOS app is a web view that loads https://<site>/my/ from this server, so the pages cannot
 * simply be removed. A browser visit to them goes to /get-app (or, on an iPhone or iPad, straight
 * to the App Store) instead. The App Store builds send a plain web-view user agent: iPhone/iPad
 * WebKit with no "Safari/" token (checked against production users 2026-11-04), so anything that
 * names a browser engine or a desktop/Android system is a browser. Everything else reaches the
 * page, which checks for the native bridge itself (web/src/main.jsx) — that catches in-app
 * browsers, which look like the app here.
 *
 * Not gated: files (scripts, styles, images the app loads), the API, and the two pages that
 * email links open — password reset and email confirmation.
 */
const BROWSER_UA = /Safari\/|Firefox\/|FxiOS|Android|Windows NT|X11|Linux|CrOS/i;
const APPLE_MOBILE_UA = /iPhone|iPad|iPod/i;
const EMAIL_LINK_PAGES = /^\/my\/(reset-password|verify-email)\/?$/;

function isBrowser(ua) {
  return BROWSER_UA.test(ua) && !/Capacitor/i.test(ua);
}

module.exports = function appOnly({ appStoreUrl }) {
  return (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    if (p !== '/my' && !p.startsWith('/my/')) return next();
    if (/\.[a-z0-9]+$/i.test(p) && !/\.html$/i.test(p)) return next();
    if (EMAIL_LINK_PAGES.test(p)) return next();
    const ua = req.get('user-agent') || '';
    if (!isBrowser(ua)) return next();
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, APPLE_MOBILE_UA.test(ua) ? appStoreUrl : '/get-app');
  };
};

module.exports.isBrowser = isBrowser;
