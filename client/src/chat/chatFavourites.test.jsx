// ============================================================
// File:        chatFavourites.test.jsx
// Path:        client/src/chat/chatFavourites.test.jsx
// Project:     Seasonal Entertainment
// Description: Favourites in the chat module: a member's favourite rooms come first under
//              "Favourites" in the full chat's room list and the star adds and removes them;
//              a member's name opens a keyboard-operable menu to add or remove them as a
//              favourite; guests see no stars and no menus; guests' names and one's own name
//              are never menus.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { ChatPanel } from './index.js';

const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'announcements', name: 'Announcements', canWrite: false },
  { slug: 'help', name: 'Help', canWrite: true },
];
const msg = (id, author, authorId, isGuest = false) => ({
  id,
  room: 'general',
  author,
  authorId,
  isGuest,
  kind: 'text',
  body: `from ${author}`,
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

// The server's favourites, changed by PUT and DELETE like the real API.
function api(session) {
  const saved = { rooms: [], users: [] };
  const change = (list, value, on) => {
    const rest = saved[list].filter((x) => JSON.stringify(x) !== JSON.stringify(value));
    saved[list] = on ? [...rest, value] : rest;
    return { body: { ok: true } };
  };
  const calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    'GET /chat/rooms/general/messages': {
      body: {
        ok: true,
        messages: [msg(1, 'zoe', 8), msg(2, 'Guest-ab12cd', null, true), msg(3, 'mia', 1)],
      },
    },
    'GET /chat/favourites': () => ({ body: { ok: true, ...saved } }),
    'PUT /chat/favourites/rooms/help': () => change('rooms', 'help', true),
    'DELETE /chat/favourites/rooms/help': () => change('rooms', 'help', false),
    'PUT /chat/favourites/users/8': () => change('users', { id: 8, username: 'zoe' }, true),
    'DELETE /chat/favourites/users/8': () => change('users', { id: 8, username: 'zoe' }, false),
  });
  return calls;
}

const show = () =>
  render(
    <SessionProvider>
      <ChatPanel room="general" variant="full" showRoomTabs />
    </SessionProvider>
  );
const rooms = () => screen.getByRole('navigation', { name: 'Rooms' });
const roomNames = () =>
  within(rooms())
    .getAllByRole('button', { name: /^(General|Announcements|Help)$/ })
    .map((b) => b.textContent);

describe('favourite rooms in the full chat', () => {
  it('the star puts a room first under Favourites, and takes it back', async () => {
    const calls = api(signedIn({ username: 'mia', role: 'member' }));
    show();
    const star = await screen.findByRole('button', { name: 'Favourite: Help' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(within(rooms()).queryByRole('heading', { name: 'Favourites' })).toBeNull();

    fireEvent.click(star);
    expect(await within(rooms()).findByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
    expect(roomNames()).toEqual(['Help', 'General', 'Announcements']);
    expect(screen.getByRole('button', { name: 'Favourite: Help' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(calls.some((c) => c.key === 'PUT /chat/favourites/rooms/help')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Favourite: Help' }));
    await vi.waitFor(() => expect(roomNames()).toEqual(['General', 'Announcements', 'Help']));
    expect(within(rooms()).queryByRole('heading', { name: 'Favourites' })).toBeNull();
  });

  it('guests see no stars and no name menus', async () => {
    api(GUEST);
    show();
    await screen.findByText('from zoe');
    expect(screen.queryByRole('button', { name: /^Favourite:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'zoe' })).toBeNull();
  });
});

describe('the name menu', () => {
  it('adds and removes a member as a favourite, by keyboard', async () => {
    const calls = api(signedIn({ username: 'mia', role: 'member' }));
    show();
    const name = await screen.findByRole('button', { name: 'zoe' });
    expect(name).toHaveAttribute('aria-haspopup', 'menu');
    name.focus();
    fireEvent.keyDown(name, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: 'zoe' });
    expect(within(menu).getByRole('menuitem', { name: 'Send private message' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const add = within(menu).getByRole('menuitem', { name: 'Add to favourites' });
    expect(add).toHaveFocus();
    // Escape closes the menu and gives the focus back to the name.
    fireEvent.keyDown(add, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(name).toHaveFocus();

    fireEvent.click(name);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to favourites' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'PUT /chat/favourites/users/8')).toBe(true)
    );
    fireEvent.click(name);
    const remove = await screen.findByRole('menuitem', { name: 'Remove from favourites' });
    fireEvent.click(remove);
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /chat/favourites/users/8')).toBe(true)
    );
  });

  it("guests' names and one's own name are plain text", async () => {
    api(signedIn({ username: 'mia', role: 'member' }));
    show();
    await screen.findByRole('button', { name: 'zoe' });
    expect(screen.queryByRole('button', { name: 'Guest-ab12cd' })).toBeNull();
    expect(screen.getByText('Guest-ab12cd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'mia' })).toBeNull();
  });
});
