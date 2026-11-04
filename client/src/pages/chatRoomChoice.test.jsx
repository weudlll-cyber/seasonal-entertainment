// ============================================================
// File:        chatRoomChoice.test.jsx
// Path:        client/src/pages/chatRoomChoice.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards which room the chat page opens (docs/CHAT.md, "Which room opens";
//              chat/useRoomToShow.js): without ?room= the first room of the member's own list
//              (General hidden from them by a Discord step: the next one, never a "No such
//              room."); a link to a room they may not read, or one that does not exist, opens
//              their first room with the same neutral note; no rooms at all: a calm empty state.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const MIA = { id: 2, username: 'mia', role: 'member' };
// General closed to Mia by a step: the server lists only these, in its order.
const VISIBLE = [
  { slug: 'announcements', name: 'Announcements', canWrite: false },
  { slug: 'help', name: 'Help', canWrite: true },
];
const roomList = (rooms) => ({
  body: { ok: true, rooms, me: { guestName: null, moderator: false } },
});
const noMessages = { body: { ok: true, messages: [] } };

function mockRooms(extra = {}) {
  return mockApi({
    ...signedIn(MIA),
    'GET /chat/rooms': roomList(VISIBLE),
    'GET /chat/rooms/announcements/messages': noMessages,
    'GET /chat/rooms/help/messages': noMessages,
    ...extra,
  });
}

const asked = (calls, slug) => calls.some((c) => c.key.startsWith(`GET /chat/rooms/${slug}/`));

it("opens the first room of the member's own list when General is hidden from them", async () => {
  const calls = mockRooms();
  await renderApp('/chat');
  expect(await screen.findByRole('region', { name: 'Chat: Announcements' })).toBeInTheDocument();
  const current = screen.getByRole('button', { name: 'Announcements' });
  expect(current).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull(); // nothing was asked for: no note
  expect(asked(calls, 'general')).toBe(false);
});

it.each([
  ['a room closed to the member', 'general'],
  ['a room that does not exist', 'no-such-room'],
])('a link to %s opens their first room with the same neutral note', async (_, slug) => {
  const calls = mockRooms({ [`GET /chat/rooms?include=${slug}`]: roomList(VISIBLE) });
  await renderApp(`/chat?room=${slug}`);
  const panel = await screen.findByRole('region', { name: 'Chat: Announcements' });
  expect(within(panel).getByRole('status')).toHaveTextContent("This room isn't available.");
  expect(screen.queryByRole('alert')).toBeNull();
  expect(asked(calls, slug)).toBe(false);
  // The note is about the link: once the member picks a room it goes.
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  await screen.findByRole('region', { name: 'Chat: Help' });
  expect(screen.queryByText("This room isn't available.")).toBeNull();
});

it('a link to a room the member may read opens it, without a note', async () => {
  mockRooms({ 'GET /chat/rooms?include=help': roomList(VISIBLE) });
  await renderApp('/chat?room=help');
  expect(await screen.findByRole('region', { name: 'Chat: Help' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).toBeNull();
});

it('a member without any room gets a calm empty state', async () => {
  const calls = mockRooms({ 'GET /chat/rooms': roomList([]) });
  await renderApp('/chat');
  expect(await screen.findByText('No rooms available.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(calls.some((c) => c.key.endsWith('/messages'))).toBe(false);
});
