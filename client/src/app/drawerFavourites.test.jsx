// ============================================================
// File:        drawerFavourites.test.jsx
// Path:        client/src/app/drawerFavourites.test.jsx
// Project:     Seasonal Entertainment
// Description: Favourite rooms in the chat drawer: the room picker lists a member's favourites
//              first, in a "Favourites" group, and the keyboard moves through both groups as
//              one list; the star beside the picker marks the current room; rooms keep their
//              colour when they become favourites; guests get no star.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import App from './App.jsx';

const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'announcements', name: 'Announcements', canWrite: false },
  { slug: 'help', name: 'Help', canWrite: true },
];

function api(session) {
  mockApi({
    ...session,
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    ...Object.fromEntries(
      ROOMS.map((r) => [`GET /chat/rooms/${r.slug}/messages`, { body: { ok: true, messages: [] } }])
    ),
    'GET /chat/favourites': { body: { ok: true, rooms: ['help'], users: [] } },
    'GET /games': { body: { ok: true, games: [] } },
    'GET /events': { body: { ok: true, events: [] } },
  });
}

beforeEach(() => {
  localStorage.clear();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

async function openPicker() {
  render(
    <MemoryRouter initialEntries={['/games']}>
      <App />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
  const drawer = screen.getByRole('dialog', { name: 'Chat' });
  const picker = await within(drawer).findByRole('button', { name: 'Room: General' });
  return { drawer, picker };
}

it("lists a member's favourite rooms first, in their own group", async () => {
  api(signedIn({ username: 'mia', role: 'member' }));
  const { drawer, picker } = await openPicker();
  const star = await within(drawer).findByRole('button', { name: 'Favourite: General' });
  expect(star).toHaveAttribute('aria-pressed', 'false');

  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  const list = await screen.findByRole('listbox', { name: 'Rooms' });
  const favourites = within(list).getByRole('group', { name: 'Favourites' });
  expect(
    within(favourites)
      .getAllByRole('option')
      .map((o) => o.textContent)
  ).toEqual(['# Help']);
  // The favourite mark is the filled stroke star (hidden from screen readers: the group says it).
  expect(list.querySelector('#room-option-help [data-icon="star-filled"]')).not.toBeNull();
  expect(list.querySelector('#room-option-general [data-icon="star-filled"]')).toBeNull();
  expect(
    within(list)
      .getAllByRole('option')
      .map((o) => o.id)
  ).toEqual(['room-option-help', 'room-option-general', 'room-option-announcements']);
  // Help keeps the colour of its place among all rooms (third: autumn).
  expect(list.querySelector('#room-option-help .room-mark')).toHaveClass('room-mark--autumn');
  // The keyboard walks both groups as one list: from General (current) up to Help.
  fireEvent.keyDown(list, { key: 'ArrowUp' });
  expect(list).toHaveAttribute('aria-activedescendant', 'room-option-help');
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(await within(drawer).findByRole('button', { name: 'Room: Help' })).toBeInTheDocument();
  expect(within(drawer).getByRole('button', { name: 'Favourite: Help' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

it('guests get no star and no Favourites group', async () => {
  api(GUEST);
  const { drawer, picker } = await openPicker();
  expect(within(drawer).queryByRole('button', { name: /^Favourite:/ })).toBeNull();
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  const list = await screen.findByRole('listbox', { name: 'Rooms' });
  expect(within(list).queryByRole('group', { name: 'Favourites' })).toBeNull();
});
