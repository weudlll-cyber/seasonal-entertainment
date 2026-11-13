// ============================================================
// File:        pushSwitch.test.jsx
// Path:        client/src/notify/pushSwitch.test.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "When a call starts" switch (PushSwitch.jsx, docs/CALLS.md,
//              "Push when a call starts"): hidden where the site has no push keys, a line
//              instead of it where the browser cannot receive push; shown off for a device the
//              server does not know for this account (also when the browser holds another
//              account's subscription), on for one it knows; turning it on shows it on at once
//              (decided 2026-11-13), even with a slow browser, and the rest of the page usable,
//              while the background asks the permission, subscribes with the site's key and
//              hands the subscription to the server; leaving the page, or closing it, does not
//              lose it; off removes it on both sides. Every way turning it on can fail, also
//              late, turns it back off with a line saying why (seen 2026-11-12: it stayed off
//              without a word): a blocked or unanswered permission, a browser that refuses or
//              does not answer, a server that refuses. jsdom has no service worker: stand-ins
//              for it and for Notification.
// ============================================================

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { BLOCKED_HELP } from './NotificationSettings.jsx';
import { SUBSCRIBE_MS } from './push.js';
import { PENDING_KEY } from './pushPending.js';
import { PUSH_FINISHING, PUSH_UNSUPPORTED } from './PushSwitch.jsx';

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
  localStorage.clear();
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
    <MemoryRouter initialEntries={['/account#notifications']}>
      <App />
    </MemoryRouter>
  );
  await screen.findByRole('heading', { name: /^Notifications/ }); // its status line may follow
  return calls;
}

// The account page's closed heading for the section: its status line, or null.
const pushStatus = () =>
  document.querySelector('#notifications .disclosure__status')?.textContent ?? null;

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
  expect(pushStatus()).toBeNull(); // not available here: no line
});

it("off for another account's subscription in this browser", async () => {
  browserSub = subscriptionFor(KEY);
  await page({ known: false });
  expect(await screen.findByRole('switch', SWITCH)).not.toBeChecked();
});

it('the section heading says whether push is on for this device, once known', async () => {
  await page({ known: false });
  await vi.waitFor(() => expect(pushStatus()).toBe('Push on this device: off'));
  fireEvent.click(screen.getByRole('switch', SWITCH));
  await vi.waitFor(() => expect(pushStatus()).toBe('Push on this device: on'));
});

it('on for a device the server knows for this account', async () => {
  browserSub = subscriptionFor(KEY);
  await page({ known: true });
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeChecked());
});

// A browser that takes its time, as Chrome's push service did (23-62 s on the owner's PC):
// subscribe answers only when the test calls answer().
function slowBrowser() {
  const held = { answer: null, fail: null };
  const subscribe = pushManager.subscribe;
  pushManager.subscribe = vi.fn(
    (options) =>
      new Promise((resolve, reject) => {
        held.answer = () => resolve(subscribe(options));
        held.fail = (err) => reject(err);
      })
  );
  return held;
}

it('on at once with a slow browser, finished in the background, the page usable; off again', async () => {
  const browser = slowBrowser();
  const calls = await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  // Right after the click: on, the note, and the other switches still usable.
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  expect(screen.getByText(PUSH_FINISHING)).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Weekly recap' })).toBeEnabled();
  expect(screen.queryByRole('alert')).toBeNull();

  await vi.waitFor(() => expect(browser.answer).toBeTypeOf('function'));
  browser.answer();
  await vi.waitFor(() => expect(screen.queryByText(PUSH_FINISHING)).toBeNull());
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(Notification.requestPermission).toHaveBeenCalledOnce();
  const [{ applicationServerKey, userVisibleOnly }] = pushManager.subscribe.mock.calls[0];
  expect(userVisibleOnly).toBe(true);
  expect(toKey(applicationServerKey)).toBe(KEY);
  expect(calls.find((c) => c.key === 'POST /push/subscriptions').body).toEqual({
    endpoint: ENDPOINT,
    keys: { p256dh: 'p', auth: 'a' },
  });
  expect(localStorage.getItem(PENDING_KEY)).toBeNull();

  const held = browserSub;
  fireEvent.click(screen.getByRole('switch', SWITCH));
  await vi.waitFor(() => expect(screen.getByRole('switch', SWITCH)).not.toBeChecked());
  expect(calls.find((c) => c.key === 'DELETE /push/subscriptions').body).toEqual({
    endpoint: ENDPOINT,
  });
  expect(held.unsubscribe).toHaveBeenCalledOnce();
});

it('a late failure turns it back off, with its reason', async () => {
  const browser = slowBrowser();
  const calls = await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  await vi.waitFor(() => expect(browser.fail).toBeTypeOf('function'));
  browser.fail(new DOMException('Registration failed - push service error', 'AbortError'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not set up push (Registration failed - push service error)'
  );
  expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  expect(screen.queryByText(PUSH_FINISHING)).toBeNull();
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(false);
});

it('leaving the page and coming back keeps a turn-on that is still finishing', async () => {
  const browser = slowBrowser();
  await page();
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  cleanup(); // the account page is left; the turn-on goes on

  await vi.waitFor(() => expect(browser.answer).toBeTypeOf('function'));
  const calls = await page();
  expect(await screen.findByRole('switch', SWITCH)).toBeChecked();
  expect(screen.getByText(PUSH_FINISHING)).toBeInTheDocument();
  browser.answer();
  await vi.waitFor(() => expect(screen.queryByText(PUSH_FINISHING)).toBeNull());
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(true);
});

it('a turn-on that a closed page left unfinished is finished on the next page load', async () => {
  // What a page closed while finishing leaves behind (the browser already subscribed).
  browserSub = subscriptionFor(KEY);
  localStorage.setItem(PENDING_KEY, JSON.stringify({ userId: 1, at: Date.now() }));
  const calls = mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    'GET /games': { body: { ok: true, games: [] } },
    'GET /push': { body: { ok: true, publicKey: KEY } },
    'POST /push/subscriptions': SAVED,
  });
  render(
    <MemoryRouter initialEntries={['/games']}>
      <App />
    </MemoryRouter>
  );
  await vi.waitFor(() =>
    expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(true)
  );
  await vi.waitFor(() => expect(localStorage.getItem(PENDING_KEY)).toBeNull());
  expect(pushManager.subscribe).not.toHaveBeenCalled(); // the browser's subscription is used
});

// Turns the switch on (on at once) and returns the line that says why it went back off.
async function failedOn() {
  fireEvent.click(await screen.findByRole('switch', SWITCH));
  expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  const alert = await screen.findByRole('alert');
  expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  expect(screen.queryByText(PUSH_FINISHING)).toBeNull();
  return alert;
}

it('a blocked permission turns it back off and says how to allow it', async () => {
  // As the browser does: the answer is also the permission from then on.
  Notification.requestPermission = vi.fn(async () => (Notification.permission = 'denied'));
  const calls = await page();
  expect(await failedOn()).toHaveTextContent(/blocked for this site.*site settings/);
  expect(await screen.findByText(BLOCKED_HELP)).toBeInTheDocument();
  expect(calls.some((c) => c.key === 'POST /push/subscriptions')).toBe(false);
});

it('a permission question closed or not shown turns it back off and says so', async () => {
  Notification.requestPermission = vi.fn(async () => 'default');
  await page();
  expect(await failedOn()).toHaveTextContent(/did not allow notifications.*site settings/);
});

it('a browser that never answers: back off after SUBSCRIBE_MS, with a line', async () => {
  pushManager.subscribe = vi.fn(() => new Promise(() => {}));
  await page();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    fireEvent.click(await screen.findByRole('switch', SWITCH));
    expect(screen.getByText(PUSH_FINISHING)).toBeInTheDocument();
    await vi.waitFor(() => expect(pushManager.subscribe).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(SUBSCRIBE_MS));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not answer in time');
    expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();
  } finally {
    vi.useRealTimers();
  }
});

it("the server's refusal turns it back off and says so", async () => {
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
