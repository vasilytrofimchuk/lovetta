// Minimal service worker — makes Lovetta installable as PWA.
// No caching: all requests go straight to network.

self.addEventListener('fetch', () => {
  // Network-only: do nothing, let the browser handle it normally
});
