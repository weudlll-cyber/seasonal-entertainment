// ============================================================
// File:        chatDrawer.test.jsx
// Path:        client/src/app/chatDrawer.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the chat drawer: the button on every page except /chat, /admin and
//              the login or registration page inside the chat's login popup; opening moves
//              focus in, Escape and the close button close it and focus goes back; the room
//              picker switches the panel's room and works by keyboard; the browser remembers
//              open state and room (and copes with blocked storage or a room the reader can
//              no longer read).
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import App from './App.jsx';
import { roomToShow } from './chatDrawerState.js';

const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'announcements', name: 'Announcements', canWrite: false },
  { slug: 'help', name: 'Help', canWrite: true },
];
const msg = (id, room) => ({
  id,
  room,
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body: `hello from ${room}`,
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeSocket);
  mockApi({
    ...GUEST,
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    ...Object.fromEntries(
      ROOMS.map((r, i) => [
        `GET /chat/rooms/${r.slug}/messages`,
        { body: { ok: true, messages: [msg(i + 1, r.slug)] } },
      ])
    ),
    'GET /games': { body: { ok: true, games: [] } },
    'GET /events': { body: { ok: true, events: [] } },
    'GET /info': { body: { ok: true, pages: [] } },
  });
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
const launcher = () => screen.getByRole('button', { name: 'Chat' });
const drawer = () => screen.getByRole('dialog', { name: 'Chat' });

describe('where the chat button is', () => {
  it.each(['/', '/games', '/events', '/info'])('shown on %s', (path) => {
    renderAt(path);
    expect(launcher()).toBeInTheDocument();
  });

  it.each(['/chat', '/admin/users'])('not on %s', (path) => {
    renderAt(path);
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
  });

  // The login popup of the chat on another site runs these pages with ?next=/embed-login….
  const popupNext = `?next=${encodeURIComponent('/embed-login?origin=https://game.example')}`;
  it.each(['/login', '/register'])('not on %s inside the login popup', async (path) => {
    renderAt(path + popupNext);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
  });

  it.each(['/login', '/register', '/login?next=/account'])('shown on %s', (path) => {
    renderAt(path);
    expect(launcher()).toBeInTheDocument();
  });
});

describe('the drawer', () => {
  it('opens with focus inside; Escape closes it and focus goes back to the button', async () => {
    renderAt('/games');
    fireEvent.click(launcher());
    expect(drawer()).toHaveFocus();
    expect(launcher()).toHaveAttribute('aria-expanded', 'true');
    expect(await within(drawer()).findByText('hello from general')).toBeInTheDocument();
    fireEvent.keyDown(drawer(), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Chat' })).toBeNull();
    expect(launcher()).toHaveFocus();
  });

  it('the close button closes it too; "Open full chat" leads to /chat', () => {
    renderAt('/games');
    fireEvent.click(launcher());
    expect(within(drawer()).getByRole('link', { name: 'Open full chat' })).toHaveAttribute(
      'href',
      '/chat'
    );
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Close chat' }));
    expect(screen.queryByRole('dialog', { name: 'Chat' })).toBeNull();
    expect(launcher()).toHaveFocus();
  });

  it('the room picker switches the room, by keyboard; Escape closes only the list', async () => {
    renderAt('/games');
    fireEvent.click(launcher());
    const button = await within(drawer()).findByRole('button', { name: 'Room: General' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox', { name: 'Rooms' });
    await vi.waitFor(() => expect(list).toHaveFocus());
    expect(list).toHaveAttribute('aria-activedescendant', 'room-option-general');
    fireEvent.keyDown(list, { key: 'End' });
    expect(list).toHaveAttribute('aria-activedescendant', 'room-option-help');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(within(drawer()).getByRole('button', { name: 'Room: Announcements' })).toHaveFocus();
    expect(await within(drawer()).findByText('hello from announcements')).toBeInTheDocument();

    fireEvent.click(within(drawer()).getByRole('button', { name: 'Room: Announcements' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(drawer()).toBeInTheDocument();
  });

  it('a click on an option picks it', async () => {
    renderAt('/games');
    fireEvent.click(launcher());
    fireEvent.click(await within(drawer()).findByRole('button', { name: 'Room: General' }));
    fireEvent.click(screen.getByRole('option', { name: /Help/ }));
    expect(await within(drawer()).findByText('hello from help')).toBeInTheDocument();
  });
});

describe('remembered per browser', () => {
  it('open state and room survive a reload', async () => {
    const { unmount } = renderAt('/games');
    fireEvent.click(launcher());
    fireEvent.click(await within(drawer()).findByRole('button', { name: 'Room: General' }));
    fireEvent.click(screen.getByRole('option', { name: /Help/ }));
    unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    renderAt('/events');
    expect(await within(drawer()).findByRole('button', { name: 'Room: Help' })).toBeInTheDocument();
    expect(drawer()).not.toHaveFocus(); // open after a reload: focus is not taken
  });

  it('with storage blocked the drawer works and starts closed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/games');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(launcher());
    expect(drawer()).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('a remembered room the reader may no longer read falls back to the first', () => {
    expect(roomToShow('organisers', ROOMS)).toBe('general');
    expect(roomToShow('help', ROOMS)).toBe('help');
    expect(roomToShow('help', [])).toBeNull();
  });
});
