// ============================================================
// File:        serviceWorkerClick.test.js
// Path:        client/src/app/serviceWorkerClick.test.js
// Project:     Seasonal Entertainment
// Description: The service worker's notification click (/sw.js, as the site serves it): it
//              opens only a path of this site, by the shared rule (shared/localPath.js), so
//              "/\evil.example" and "//evil.example" open the site's start page instead.
// ============================================================

import { describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource } from '../../serviceWorkerPlugin.js';

const ORIGIN = 'https://site.example';

// Runs the worker's script with a stand-in `self` and `clients`; returns the click's target.
async function clickTarget(url) {
  const listeners = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, listener) => (listeners[type] = listener),
  };
  const clients = { matchAll: async () => [], openWindow: vi.fn() };
  new Function('self', 'clients', serviceWorkerSource())(self, clients);
  let done;
  listeners.notificationclick({
    notification: { close: () => {}, data: { url } },
    waitUntil: (promise) => (done = promise),
  });
  await done;
  return clients.openWindow.mock.calls[0][0];
}

describe('a click on the "has started" notification', () => {
  it("opens the call's page", async () => {
    expect(await clickTarget('/calls/12')).toBe(`${ORIGIN}/calls/12`);
  });

  it.each(['/\\evil.example', '//evil.example', 'https://evil.example/', 5])(
    'never leaves the site: %s opens the start page',
    async (url) => {
      expect(await clickTarget(url)).toBe(`${ORIGIN}/`);
    }
  );
});
