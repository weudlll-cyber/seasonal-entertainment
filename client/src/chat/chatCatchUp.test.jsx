// ============================================================
// File:        chatCatchUp.test.jsx
// Path:        client/src/chat/chatCatchUp.test.jsx
// Project:     Seasonal Entertainment
// Description: A room message sent while the chat connection reopens after a login is never
//              lost (BACKLOG "Check a live room message right after login"). The two gaps,
//              each held open on purpose: (a) the message is stored after the panel's load but
//              before the server confirms the new socket's subscription, so it is neither loaded
//              nor pushed — the panel must fetch what it missed once the subscription stands;
//              (b) the message is pushed while the load is still on its way — the load must not
//              wipe it.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import { ChatPanel } from './index.js';

const MIA = { id: 7, username: 'mia', role: 'member' };
const ROOMS = {
  body: {
    ok: true,
    rooms: [{ slug: 'general', name: 'General', canWrite: true }],
    me: { guestName: null, moderator: false },
  },
};

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const msg = (id, body) => ({
  id,
  room: 'general',
  author: 'zoe',
  isGuest: false,
  kind: 'text',
  body,
  media: null,
  preview: null,
  createdAt: '2026-10-19T18:00:00.000Z',
  hiddenAt: null,
});

function LogIn() {
  const { setUser } = useSession();
  return <button onClick={() => setUser(MIA)}>log in</button>;
}

const SUBSCRIBE = { type: 'subscribe', room: 'general' };
const newest = () => FakeSocket.all.at(-1);

// Renders a guest's panel, waits until its socket has asked for the room, then logs in; returns
// the panel and the member's (new) socket once it has asked for the room. Counted from the
// guest's socket, not from zero: the shared connection outlives a test (connection.js keeps
// the last account), so a panel may open a socket of its own before the login.
async function logInWithPanel() {
  render(
    <SessionProvider>
      <LogIn />
      <ChatPanel room="general" variant="compact" />
    </SessionProvider>
  );
  const panel = await screen.findByRole('region', { name: 'Chat: General' });
  await vi.waitFor(() => expect(newest()?.sent).toContainEqual(SUBSCRIBE));
  const guest = newest();
  fireEvent.click(screen.getByRole('button', { name: 'log in' }));
  await vi.waitFor(() => expect(newest()).not.toBe(guest));
  const member = newest();
  await vi.waitFor(() => expect(member.sent).toContainEqual(SUBSCRIBE));
  return { panel, member };
}

it('(a) fetches a message stored while the new socket was not yet subscribed', async () => {
  const stored = [msg(1, 'before the login')]; // the server's room
  const calls = mockApi({
    ...GUEST,
    'GET /chat/rooms': ROOMS,
    'GET /chat/rooms/general/messages': () => ({ body: { ok: true, messages: [...stored] } }),
    'GET /chat/rooms/general/messages?after=1': () => ({
      body: { ok: true, messages: stored.filter((m) => m.id > 1) },
    }),
  });
  const { panel, member } = await logInWithPanel();
  await within(panel).findByText('before the login');
  const loads = calls.filter((c) => c.key === 'GET /chat/rooms/general/messages').length;

  // Stored now, while the server has not taken the subscription yet: nothing is pushed.
  stored.push(msg(2, 'sent during the reconnect'));
  expect(within(panel).queryByText('sent during the reconnect')).toBeNull();
  member.push({ type: 'subscribed', room: 'general' });

  expect(await within(panel).findByText('sent during the reconnect')).toBeInTheDocument();
  // It asked only for what it had missed, not the whole room again.
  expect(calls.filter((c) => c.key === 'GET /chat/rooms/general/messages')).toHaveLength(loads);
  expect(calls.map((c) => c.key)).toContain('GET /chat/rooms/general/messages?after=1');
});

it('(b) keeps a message pushed while the load after the login was on its way', async () => {
  let releaseLoad; // the member's load, held until the push has arrived
  let loadCount = 0;
  mockApi({
    ...GUEST,
    'GET /chat/rooms': ROOMS,
    'GET /chat/rooms/general/messages': () => {
      loadCount += 1;
      if (loadCount === 1) return { body: { ok: true, messages: [] } }; // the guest's load
      return new Promise((resolve) => {
        releaseLoad = () => resolve({ body: { ok: true, messages: [msg(1, 'older')] } });
      });
    },
  });
  const { panel, member } = await logInWithPanel();
  await vi.waitFor(() => expect(releaseLoad).toBeTypeOf('function'));

  member.push({ type: 'message', room: 'general', message: msg(2, 'pushed meanwhile') });
  expect(within(panel).getByText('pushed meanwhile')).toBeInTheDocument();
  releaseLoad();

  expect(await within(panel).findByText('older')).toBeInTheDocument();
  expect(within(panel).getByText('pushed meanwhile')).toBeInTheDocument();
  // In order: the load's older message first.
  const items = within(panel)
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  const at = (text) => items.findIndex((t) => t.includes(text));
  expect(at('older')).toBeLessThan(at('pushed meanwhile'));
});
