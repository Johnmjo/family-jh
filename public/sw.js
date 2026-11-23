// Minimal service worker so JH can be installed to the home screen. Logging while offline is handled
// by the app's own outbox (sets are kept on the phone and sent when the signal comes back).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
