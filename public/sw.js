// Lovetta service worker — PWA install + push notifications.
// No caching: all requests go straight to network.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Lovetta';
  const options = {
    body: data.body || 'You have a new message',
    icon: '/assets/brand/icon-180.png',
    badge: '/assets/brand/icon-180.png',
    data: { url: data.url || '/my/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/my/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes('/my/') && 'focus' in client) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', () => {
  // Network-only: do nothing, let the browser handle it normally
});
