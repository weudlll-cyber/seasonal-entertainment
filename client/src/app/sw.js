// ============================================================
// File:        sw.js
// Path:        client/src/app/sw.js
// Project:     Seasonal Entertainment
// Description: The site's service worker, only as far as installing the site and its one web
//              push need it (docs/CALLS.md, "Push when a call starts"; decided 2026-11-10): it
//              caches nothing and answers no request (no fetch handler: every page and API
//              answer comes from the network as without it). A push shows "<call title> has
//              started"; a click focuses a tab already on that call's page or opens it.
//              Registered for every visitor (client/src/app/serviceWorker.js); served from the
//              site's root as /sw.js, so its scope is the whole site, with shared/localPath.js
//              put in front of it (client/serviceWorkerPlugin.js): localPathOr comes from there.
// ============================================================

/* global localPathOr */

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
  // Only a path of this site ("/calls/12"), never another address: the login's rule.
  const url = new URL(localPathOr(event.notification.data?.url, '/'), self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url);
      return open ? open.focus() : clients.openWindow(url);
    })
  );
});
