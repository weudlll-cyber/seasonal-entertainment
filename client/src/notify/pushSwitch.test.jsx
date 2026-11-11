// ============================================================
// File:        pushSwitch.test.jsx
// Path:        client/src/notify/pushSwitch.test.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "When a call starts" switch (PushSwitch.jsx, docs/CALLS.md,
//              "Push when a call starts"): hidden where the site has no push keys and where the
//              browser cannot receive push; shown off for a device the server does not know for
//              this account (also when the browser holds another account's subscription), on
//              for one it knows; turning it on asks the browser's permission, subscribes with
//              the site's key and hands the subscription to the server; off removes it on both
//              sides; a refusal shows how to allow notifications. jsdom has no service worker:
//              stand-ins for it and for Notification.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { BLOCKED_HELP } from './NotificationSettings.jsx';

// base64url both ways, as the browser code does it.
const toKey = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromKey = (key) =>
  Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
// A real-looking key: 65 bytes, base64url.
const KEY = toKey(new Uint8Array(65).fill(4));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';
const SWITCH = { name: /When a call starts/ };

let browserSub;
let pushManager;

function subscriptionFor(key) {
  return {
    endpoint: ENDPOINT,
    options: { applicationServerKey: fromKey(key).buffer },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => {
      browserSub = null;
      return true;
    }),
  };
}

beforeEach(() => {
  browserSub = null;
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  // A function, as the browser's is (systemNotify.js checks that).
  vi.stubGlobal(
    'Notification',
    class {
      static permission = 'default';
      static requestPermission = vi.fn(async () => 'granted');
    }
  );
  vi.stubGlobal('PushManager', class {});
  pushManager = {
    getSubscription: vi.fn(async () => browserSub),
    subscribe: vi.fn(async ({ applicationServerKey }) => {
      browserSub = subscriptionFor(toKey(applicationServerKey));
      return browserSub;
    }),
  };
  const registration = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete navigator.serviceWorker;
});

// mia's account page; known: whether the server knows this device for her.
async function page({ publicKey = KEY, known = false } = {}) {
  const calls = mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    'GET /push': { body: { ok: true, publicKey } },
    'POST /push/status': { body: { ok: true, subscribed: known } },
    'POST /push/subscriptions': { status: 201, body: { ok: true } },
    'DELETE /push/subscriptions': { body: { ok: true } },
  });
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App />
    </MemoryRouter>
  );
  await screen.findByRole('heading', { name: 'Notifications' });
  return calls;
}

it('hidden where the site has no push keys', async () => {
  const calls = await page({ publicKey: null });
  await vi.waitFor(() => expect(calls.some((c) => c.key === 'GET /push')).toBe(true));
  expect(screen.queryByRole('switch', SWITCH)).toBeNull();
});

it('hidden where the browser cannot receive push (no call to the server either)', async () => {
  vi.stubGlobal('PushManager', undefined);
  delete window.PushManager;
  const calls = await page();
  await screen.findByRole('switch', { name: 'Weekly recap' });
  expect(screen.queryByRole('switch', SWITCH)).toBeNull();
  expect(calls.some((c) => c.key === 'GET /push')).toBe(false);
});

it("off for another account's subscription in this browser", async () => {
  browserSub = subscriptionFor(KEY);
  await page({ known: false });
  expect(await screen.findByRole('switch', SWITCH)).not.toBeChecked();
});

it('on for a device the server knows for this account', async () => {
  browserSub = subscriptionFor(KEY);
  await page({ known: true });
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeChecked());
});

it('on: permission, a subscription with the site key, handed to the server; off again', async () => {
  const calls = await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeChecked());
  expect(Notification.requestPermission).toHaveBeenCalledOnce();
  const [{ applicationServerKey, userVisibleOnly }] = pushManager.subscribe.mock.calls[0];
  expect(userVisibleOnly).toBe(true);
  expect(toKey(applicationServerKey)).toBe(KEY);
  expect(calls.find((c) => c.key === 'POST /push/subscriptions').body).toEqual({
    endpoint: ENDPOINT,
    keys: { p256dh: 'p', auth: 'a' },
  });

  const held = browserSub;
  fireEvent.click(screen.getByRole('switch', SWITCH));
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).not.toBeChecked());
  expect(calls.find((c) => c.key === 'DELETE /push/subscriptions').body).toEqual({
    endpoint: ENDPOINT,
  });
  expect(held.unsubscribe).toHaveBeenCalledOnce();
});

it('a refused permission leaves it off and says how to allow it', async () => {
  Notification.requestPermission = vi.fn(async () => 'denied');
  const calls = await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  expect(await screen.findByText(BLOCKED_HELP)).toBeInTheDocument();
  expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(false);
});
