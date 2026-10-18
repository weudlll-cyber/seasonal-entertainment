// ============================================================
// File:        unread.test.jsx
// Path:        client/src/chat/unread.test.jsx
// Project:     Seasonal Entertainment
// Description: The unread counters in the browser: a room's count shows in the full chat's room
//              list and on the tab and the sidebar's "Chat" item; showing the room's newest
//              message moves the read marker; an "activity" or "read" event from the server (a
//              message elsewhere, a read in another tab) recounts everything; 0 shows nothing,
//              more than 99 shows "99+"; guests have no counters and ask for none.
// ============================================================

import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { badgeText } from './unread.js';

const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'help', name: 'Help', canWrite: true },
];
const msg = (id) => ({
  id,
  room: 'general',
  author: 'zoe',
  authorId: 8,
  isGuest: false,
  kind: 'text',
  body: `message ${id}`,
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-18T09:00:00.000Z',
  hiddenAt: null,
});

let counts;
let calls;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  counts = { general: 0, help: 4 };
});

function chatPage(session) {
  calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [msg(20), msg(21)] } },
    'GET /chat/favourites': { body: { ok: true, rooms: [], users: [] } },
    'GET /chat/unread': () => ({
      body: {
        ok: true,
        rooms: ROOMS.map((r) => ({ slug: r.slug, count: counts[r.slug] })),
        direct: [],
      },
    }),
    'POST /chat/rooms/general/read': { body: { ok: true } },
  });
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
}

const roomList = () => screen.getByRole('navigation', { name: 'Rooms' });

it("shows each room's count and the totals; the shown room is marked read", async () => {
  chatPage(signedIn({ id: 1, username: 'mia', role: 'member' }));
  expect(
    await within(roomList()).findByRole('img', { name: '4 unread in Help' })
  ).toHaveTextContent('4');
  expect(within(roomList()).queryByRole('img', { name: /unread in General/ })).toBeNull();
  expect(screen.getByRole('tab', { name: /^Rooms ?4 unread$/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Chat: 4 unread room messages' })).toBeInTheDocument();
  // General shows its newest message: the marker moves to it.
  await vi.waitFor(() =>
    expect(calls.find((c) => c.key === 'POST /chat/rooms/general/read')?.body).toEqual({
      lastId: 21,
    })
  );
});

it('recounts on the server events (a message elsewhere, a read in another tab)', async () => {
  chatPage(signedIn({ id: 1, username: 'mia', role: 'member' }));
  await within(roomList()).findByRole('img', { name: '4 unread in Help' });
  counts.help = 5;
  act(() => FakeSocket.all.at(-1).push({ type: 'activity', room: 'help' }));
  expect(
    await within(roomList()).findByRole('img', { name: '5 unread in Help' })
  ).toBeInTheDocument();
  counts.help = 0;
  act(() => FakeSocket.all.at(-1).push({ type: 'read' }));
  await vi.waitFor(() => expect(within(roomList()).queryByRole('img')).toBeNull());
  expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument();
});

it('guests have no counters and ask for none', async () => {
  counts.help = 4;
  chatPage(GUEST);
  await screen.findByText('message 21');
  expect(screen.queryByRole('img', { name: /unread/ })).toBeNull();
  expect(calls.some((c) => c.key === 'GET /chat/unread')).toBe(false);
  expect(calls.some((c) => c.key.endsWith('/read'))).toBe(false);
});

it('shows "99+" above 99', () => {
  expect([0, 7, 99, 100, 2500].map(badgeText)).toEqual(['0', '7', '99', '99+', '99+']);
});
