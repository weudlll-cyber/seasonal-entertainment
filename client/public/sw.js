// ============================================================
// File:        sw.js
// Path:        client/public/sw.js
// Project:     Seasonal Entertainment
// Description: The site's service worker, only as far as installing the site and its one web
//              push need it (docs/CALLS.md, "Push when a call starts"; decided 2026-11-10): it
//              caches nothing and answers no request (no fetch handler: every page and API
//              answer comes from the network as without it). A push shows "<call title> has
//              started"; a click focuses a tab already on that call's page or opens it.
//              Registered for every visitor (client/src/app/serviceWorker.js); served from the
//              site's root, so its scope is the whole site.
// ============================================================

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification('Seasonal Entertainment', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only a path of this site ("/calls/12"), never another address.
  const path = event.notification.data?.url;
  const url = new URL(
    typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : '/',
    self.location.origin
  ).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url);
      return open ? open.focus() : clients.openWindow(url);
    })
  );
});
