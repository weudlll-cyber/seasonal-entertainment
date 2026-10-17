// ============================================================
// File:        chatAccount.test.jsx
// Path:        client/src/chat/chatAccount.test.jsx
// Project:     Seasonal Entertainment
// Description: A chat panel that stays on the page while the account changes: logging in
//              without navigating reconnects the shared connection (the server knows the
//              reader only at connect time), reloads rooms and messages, and the panel then
//              writes as the member; logging out makes it a guest's panel again.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import { ChatPanel } from './index.js';

const MIA = { id: 7, username: 'mia', role: 'member' };

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const msg = (id, author, isGuest, body) => ({
  id,
  room: 'general',
  author,
  isGuest,
  kind: 'text',
  body,
  media: null,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

// Logs in and out the way the site's pages do: through the account context, no navigation.
function AccountSwitch() {
  const { setUser } = useSession();
  return (
    <>
      <button onClick={() => setUser(MIA)}>log in</button>
      <button onClick={() => setUser(null)}>log out</button>
    </>
  );
}

const subscribed = (socket) => socket.sent.filter((s) => s.type === 'subscribe');

it('reconnects as the member after a login and as a guest after a logout', async () => {
  let member = false; // what the server's session says
  const calls = mockApi({
    ...GUEST,
    'GET /chat/rooms': () => ({
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator: false },
      },
    }),
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [] } },
    'POST /chat/rooms/general/messages': (sent) => ({
      status: 201,
      body: {
        ok: true,
        message: member ? msg(5, 'mia', false, sent.body) : msg(6, 'Guest-ab12', true, sent.body),
      },
    }),
  });
  render(
    <SessionProvider>
      <AccountSwitch />
      <ChatPanel room="general" variant="compact" />
    </SessionProvider>
  );
  const panel = await screen.findByRole('region', { name: 'Chat: General' });
  expect(await within(panel).findByText(/You are a guest/)).toBeInTheDocument();
  await vi.waitFor(() => expect(subscribed(FakeSocket.all[0])).toHaveLength(1));
  const loads = (key) => calls.filter((c) => c.key === key).length;
  const roomLoads = () => loads('GET /chat/rooms');
  const messageLoads = () => loads('GET /chat/rooms/general/messages');
  expect(roomLoads()).toBe(1);

  member = true;
  fireEvent.click(screen.getByRole('button', { name: 'log in' }));
  // The guest's socket is gone; a new one subscribes the panel's room again.
  await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  expect(FakeSocket.all[0].closed).toBe(true);
  await vi.waitFor(() =>
    expect(subscribed(FakeSocket.all[1])).toEqual([{ type: 'subscribe', room: 'general' }])
  );
  await vi.waitFor(() => expect(roomLoads()).toBe(2));
  expect(messageLoads()).toBe(2);
  expect(within(panel).queryByText(/You are a guest/)).toBeNull();
  expect(within(panel).getByLabelText('File to attach')).toBeInTheDocument();

  fireEvent.change(within(panel).getByLabelText('Message'), { target: { value: 'as mia' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
  await within(panel).findByText('as mia');
  const item = within(panel)
    .getAllByRole('listitem')
    .find((li) => li.textContent.includes('as mia'));
  expect(within(item).getByText('mia')).toBeInTheDocument();
  expect(within(item).queryByText('Guest')).toBeNull();
  // Live events now arrive on the member's connection.
  FakeSocket.all[1].push({ type: 'message', room: 'general', message: msg(8, 'zoe', false, 'hi') });
  expect(within(panel).getByText('hi')).toBeInTheDocument();

  member = false;
  fireEvent.click(screen.getByRole('button', { name: 'log out' }));
  await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(3));
  expect(FakeSocket.all[1].closed).toBe(true);
  await vi.waitFor(() => expect(subscribed(FakeSocket.all[2])).toHaveLength(1));
  expect(await within(panel).findByText(/You are a guest/)).toBeInTheDocument();
  expect(within(panel).queryByLabelText('File to attach')).toBeNull();
  expect(roomLoads()).toBe(3);
  expect(messageLoads()).toBe(3);
});
