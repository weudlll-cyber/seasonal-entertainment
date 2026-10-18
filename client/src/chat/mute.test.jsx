// ============================================================
// File:        mute.test.jsx
// Path:        client/src/chat/mute.test.jsx
// Project:     Seasonal Entertainment
// Description: Muting a room in the full chat's room list: the bell (aria-pressed) mutes it on
//              the server; the room's count then stays, dimmed, but leaves the blue total (tab
//              and sidebar); unmuting brings it back; a fresh page shows the room still muted
//              (the server keeps it, per account).
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';

const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'help', name: 'Help', canWrite: true },
];
let server;

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  server = { help: { count: 4, muted: false }, general: { count: 1, muted: false } };
  const mute = (on) => () => {
    server.help.muted = on;
    return { body: { ok: true } };
  };
  mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [] } },
    'GET /chat/favourites': { body: { ok: true, rooms: [], users: [] } },
    'GET /chat/unread': () => ({
      body: {
        ok: true,
        rooms: ROOMS.map((r) => ({ slug: r.slug, ...server[r.slug] })),
        direct: [],
      },
    }),
    'PUT /chat/rooms/help/mute': mute(true),
    'DELETE /chat/rooms/help/mute': mute(false),
  });
});

const page = () =>
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
const rooms = () => screen.getByRole('navigation', { name: 'Rooms' });
const roomsTab = (total) =>
  screen.getByRole('tab', { name: new RegExp(`^Rooms ?${total} unread$`) });
// The server says "muted" to all of the member's sockets; every counter recounts.
const pushMuted = () => act(() => FakeSocket.all.at(-1).push({ type: 'muted' }));

it('a muted room keeps its count, dimmed, but leaves the total; unmuting restores it', async () => {
  page();
  await within(rooms()).findByRole('img', { name: '4 unread in Help' });
  expect(roomsTab(5)).toBeInTheDocument();
  const bell = within(rooms()).getByRole('button', { name: 'Mute: Help' });
  expect(bell).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(bell);
  await vi.waitFor(() => expect(server.help.muted).toBe(true));
  pushMuted();
  await vi.waitFor(() => expect(roomsTab(1)).toBeInTheDocument());
  expect(within(rooms()).getByRole('img', { name: '4 unread in Help' })).toHaveClass(
    'chat-count--dim'
  );
  expect(within(rooms()).getByRole('button', { name: 'Mute: Help' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByRole('link', { name: 'Chat: 1 unread room message' })).toBeInTheDocument();

  fireEvent.click(within(rooms()).getByRole('button', { name: 'Mute: Help' }));
  await vi.waitFor(() => expect(server.help.muted).toBe(false));
  pushMuted();
  await vi.waitFor(() => expect(roomsTab(5)).toBeInTheDocument());
  expect(within(rooms()).getByRole('img', { name: '4 unread in Help' })).not.toHaveClass(
    'chat-count--dim'
  );
});

it('a fresh page shows the room still muted', async () => {
  server.help.muted = true;
  page();
  const bell = await within(rooms()).findByRole('button', { name: 'Mute: Help' });
  await vi.waitFor(() => expect(bell).toHaveAttribute('aria-pressed', 'true'));
  expect(roomsTab(1)).toBeInTheDocument();
});
