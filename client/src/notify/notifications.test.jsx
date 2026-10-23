// ============================================================
// File:        notifications.test.jsx
// Path:        client/src/notify/notifications.test.jsx
// Project:     Seasonal Entertainment
// Description: Browser notifications (notify/, docs/CHAT.md, "Notifications"): no permission
//              is asked on page load, only by "Turn on notifications" (which then turns both
//              switches on), and a blocked browser is told how to allow them; a mention or a
//              direct message notifies only when no tab of the site is visible, once across
//              tabs, only for the switches turned on; a direct message's notification never
//              carries its text; a click opens the room; "Weekly recap" is off by default and,
//              turned on, says "Weekly recap is out". jsdom has no Notification: a stand-in.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi } from '../test/mockApi.js';
import { BLOCKED_HELP } from './NotificationSettings.jsx';

const MIA = { id: 1, username: 'mia', email: 'mia@example.org', role: 'member' };
let shown;
let visibility;

class FakeNotification {
  static permission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  constructor(title, options) {
    this.title = title;
    this.options = options;
    shown.push(this);
  }
  close() {}
}

beforeEach(() => {
  shown = [];
  visibility = 'hidden';
  localStorage.clear();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('Notification', FakeNotification);
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission.mockClear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => vi.unstubAllGlobals());

// mia's page with her switches; returns the API calls.
async function page(switches = {}, path = '/account') {
  let user = { ...MIA, notifyMentions: false, notifyDirect: false, ...switches };
  const calls = mockApi({
    'GET /auth/session': () => ({ body: { ok: true, user } }),
    'PUT /auth/notifications': (sent) => {
      user = { ...user, ...sent };
      return { body: { ok: true } };
    },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
  await screen.findByRole('heading', { name: 'Notifications' });
  await vi.waitFor(() => expect(FakeSocket.all.length).toBeGreaterThan(0));
  return calls;
}

const push = (event) => act(() => FakeSocket.all.at(-1).push(event));
const MENTION = {
  type: 'mention',
  id: 41,
  room: 'general',
  roomName: 'General',
  author: 'tom',
  text: 'hello @mia, are you there?',
};
const RECAP = { type: 'recap', id: 90, room: 'announcements' };
const DIRECT = {
  type: 'direct',
  senderName: 'tom',
  message: { id: 7, senderId: 2, recipientId: 1, nonce: 'n', ciphertext: 'secret-cipher' },
};

describe('permission', () => {
  it('is never asked on page load; "Turn on notifications" asks and turns both on', async () => {
    const calls = await page();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    FakeNotification.permission = 'granted';
    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    await vi.waitFor(() => expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'PUT /auth/notifications')?.body).toEqual({
        notifyMentions: true,
        notifyDirect: true,
      })
    );
    expect(await screen.findByRole('switch', { name: 'When someone mentions me' })).toBeChecked();
  });

  it('a blocked browser is told how to allow them', async () => {
    FakeNotification.permission = 'denied';
    await page();
    expect(screen.getByRole('status')).toHaveTextContent(BLOCKED_HELP);
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
  });
});

describe('notifications', () => {
  beforeEach(() => {
    FakeNotification.permission = 'granted';
  });

  it('a mention notifies only while no tab of the site is visible', async () => {
    await page({ notifyMentions: true });
    visibility = 'visible';
    push(MENTION);
    expect(shown).toHaveLength(0);
    visibility = 'hidden';
    // Another tab of the site is visible: it shows the mention itself.
    localStorage.setItem('se.visibleTab.other', String(Date.now()));
    push({ ...MENTION, id: 42 });
    expect(shown).toHaveLength(0);
    localStorage.removeItem('se.visibleTab.other');
    push({ ...MENTION, id: 43 });
    expect(shown.map((n) => n.options.body)).toEqual([
      'tom mentioned you in General: hello @mia, are you there?',
    ]);
  });

  it('one notification per event across tabs', async () => {
    await page({ notifyMentions: true });
    // Every tab of the member hears the event: the first one claims it.
    push(MENTION);
    push(MENTION);
    expect(shown).toHaveLength(1);
  });

  it("a direct message's notification names the sender, never the text", async () => {
    await page({ notifyDirect: true });
    push(DIRECT);
    expect(shown).toHaveLength(1);
    expect(shown[0].options.body).toBe('New message from tom');
    expect(JSON.stringify(shown[0])).not.toContain('secret-cipher');
  });

  it('only the switches turned on', async () => {
    await page({ notifyMentions: false, notifyDirect: false });
    push(MENTION);
    push(DIRECT);
    expect(shown).toHaveLength(0);
  });

  it('the weekly recap: off by default, then "Weekly recap is out", opening its room', async () => {
    await page();
    expect(screen.getByRole('switch', { name: 'Weekly recap' })).not.toBeChecked();
    push(RECAP);
    expect(shown).toHaveLength(0);
    fireEvent.click(screen.getByRole('switch', { name: 'Weekly recap' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Weekly recap' })).toBeChecked()
    );
    push({ ...RECAP, id: 91 });
    expect(shown.map((n) => n.options.body)).toEqual(['Weekly recap is out']);
    act(() => shown[0].onclick());
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument();
  });

  it('a click focuses the site and opens the room', async () => {
    await page({ notifyMentions: true });
    window.focus = vi.fn();
    push(MENTION);
    act(() => shown[0].onclick());
    expect(window.focus).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument();
  });
});
