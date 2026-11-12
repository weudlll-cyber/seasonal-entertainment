// ============================================================
// File:        pushSwitch.test.jsx
// Path:        client/src/notify/pushSwitch.test.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "When a call starts" switch (PushSwitch.jsx, docs/CALLS.md,
//              "Push when a call starts"): hidden where the site has no push keys, a line
//              instead of it where the browser cannot receive push; shown off for a device the
//              server does not know for this account (also when the browser holds another
//              account's subscription), on for one it knows; turning it on says it is working,
//              asks the browser's permission, subscribes with the site's key and hands the
//              subscription to the server; off removes it on both sides. Every way turning it on
//              can fail leaves it off with a line saying why (seen 2026-11-12: it stayed off
//              without a word): a blocked or unanswered permission, a browser that refuses or
//              does not answer, a server that refuses. jsdom has no service worker: stand-ins
//              for it and for Notification.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { BLOCKED_HELP } from './NotificationSettings.jsx';
import { SUBSCRIBE_MS } from './push.js';
import { PUSH_UNSUPPORTED, PUSH_WORKING } from './PushSwitch.jsx';

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

// mia's account page; known: whether the server knows this device for her; saved: the
// server's answer to a new subscription.
const SAVED = { status: 201, body: { ok: true } };
async function page({ publicKey = KEY, known = false, saved = SAVED } = {}) {
  const calls = mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    'GET /push': { body: { ok: true, publicKey } },
    'POST /push/status': { body: { ok: true, subscribed: known } },
    'POST /push/subscriptions': saved,
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

it('where the browser cannot receive push, a line says so instead of the switch', async () => {
  vi.stubGlobal('PushManager', undefined);
  delete window.PushManager;
  const calls = await page();
  expect(await screen.findByText(PUSH_UNSUPPORTED)).toBeInTheDocument();
  expect(screen.queryByRole('switch', SWITCH)).toBeNull();
  expect(calls.some((c) => c.key === 'POST /push/status')).toBe(false);
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
  // The browser takes its time, as Chrome's push service did (32 s on a fresh profile).
  let answer;
  const subscribe = pushManager.subscribe;
  pushManager.subscribe = vi.fn(
    (options) => new Promise((resolve) => (answer = () => resolve(subscribe(options))))
  );
  const calls = await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  expect(await screen.findByText(PUSH_WORKING)).toBeInTheDocument();
  await vi.waitFor(() => expect(answer).toBeDefined());
  answer();
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeChecked());
  expect(screen.queryByText(PUSH_WORKING)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
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

// Turns the switch on and returns the line that says why it stayed off.
async function failedOn() {
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  const alert = await screen.findByRole('alert');
  expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  expect(screen.queryByText(PUSH_WORKING)).toBeNull();
  return alert;
}

it('a blocked permission leaves it off and says how to allow it', async () => {
  // As the browser does: the answer is also the permission from then on.
  Notification.requestPermission = vi.fn(async () => (Notification.permission = 'denied'));
  const calls = await page();
  expect(await failedOn()).toHaveTextContent(/blocked for this site.*site settings/);
  expect(await screen.findByText(BLOCKED_HELP)).toBeInTheDocument();
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(false);
});

it('a permission question closed or not shown leaves it off and says so', async () => {
  Notification.requestPermission = vi.fn(async () => 'default');
  await page();
  expect(await failedOn()).toHaveTextContent(/did not allow notifications.*site settings/);
});

it("the browser's refusal to subscribe leaves it off and names the browser's reason", async () => {
  pushManager.subscribe = vi.fn(async () => {
    throw new DOMException('Registration failed - push service error', 'AbortError');
  });
  const calls = await page();
  expect(await failedOn()).toHaveTextContent(
    'could not set up push (Registration failed - push service error)'
  );
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(false);
});

it('a browser that never answers: off after SUBSCRIBE_MS, with a line', async () => {
  pushManager.subscribe = vi.fn(() => new Promise(() => {}));
  await page();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    fireEvent.click(await screen.findByRole('switch', SWITCH));
    expect(await screen.findByText(PUSH_WORKING)).toBeInTheDocument();
    await vi.waitFor(() => expect(pushManager.subscribe).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(SUBSCRIBE_MS));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not answer in time');
    expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  } finally {
    vi.useRealTimers();
  }
});

it("the server's refusal leaves it off and says so", async () => {
  const refused = {
    ok: false,
    error: 'bad_endpoint',
    message: 'This push address is not accepted.',
  };
  await page({ saved: { status: 400, body: refused } });
  expect(await failedOn()).toHaveTextContent(
    'the site refused it. This push address is not accepted.'
  );
});
