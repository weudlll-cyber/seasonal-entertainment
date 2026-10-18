// ============================================================
// File:        userStar.test.jsx
// Path:        client/src/chat/userStar.test.jsx
// Project:     Seasonal Entertainment
// Description: The favourite star beside members in the Direct tab: starring a conversation
//              partner stores the favourite and moves them first; a fresh page shows it still
//              starred; the name menu in a room then offers "Remove from favourites" (one
//              shared state); a "Find a member" result shows the same star (the filled stroke
//              icon, as for rooms).
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { resetDevice } from '../test/memoryDeviceKey.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { showDirect } from './directView.js';

vi.mock('../keys/deviceKey.js', () => import('../test/memoryDeviceKey.js'));

let server;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
  server = { favourites: [] };
});

const ANN = { id: 2, username: 'ann' };
const BOB = { id: 3, username: 'bob' };

async function chatPage() {
  resetDevice({ userId: 1, keyId: 1, privateKey: new Uint8Array(32) });
  const fav = (on) => () => {
    server.favourites = on ? [ANN] : [];
    return { body: { ok: true } };
  };
  mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
    'GET /keys/me': {
      body: {
        ok: true,
        key: { keyId: 1, publicKey: 'AA==', sealedPrivateKey: 'AA==', recovery: null },
      },
    },
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator: false },
      },
    },
    'GET /chat/rooms/general/messages': {
      body: {
        ok: true,
        messages: [
          {
            id: 1,
            room: 'general',
            author: 'ann',
            authorId: 2,
            isGuest: false,
            kind: 'text',
            body: 'hello',
            media: null,
            file: null,
            preview: null,
            mentions: [],
            createdAt: '2026-10-18T09:00:00.000Z',
            hiddenAt: null,
          },
        ],
      },
    },
    'GET /chat/favourites': () => ({ body: { ok: true, rooms: [], users: server.favourites } }),
    'PUT /chat/favourites/users/2': fav(true),
    'DELETE /chat/favourites/users/2': fav(false),
    'GET /chat/direct': () => ({
      body: {
        ok: true,
        conversations: [ANN, BOB].map((p) => ({
          partner: { ...p, online: false },
          favourite: server.favourites.some((f) => f.id === p.id),
          lastMessageAt: p === BOB ? '2026-10-18T09:00:00Z' : '2026-10-18T08:00:00Z',
        })),
      },
    }),
    'GET /chat/members?q=an': {
      body: { ok: true, members: [{ ...ANN, canReceive: true, online: false }] },
    },
  });
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('tab', { name: /^Direct/ }));
}

const order = () =>
  [
    ...screen
      .getByRole('list', { name: 'Private conversations' })
      .querySelectorAll('.chat-direct-list__name'),
  ].map((n) => n.textContent);

// The stroke icon a toggle shows (icons.jsx names it in data-icon).
const iconOf = (button) => button.querySelector('svg').dataset.icon;

it('starring a partner moves them first and stays; the name menu agrees', async () => {
  await chatPage();
  await screen.findByRole('list', { name: 'Private conversations' });
  expect(order()).toEqual(['bob', 'ann']);
  const star = screen.getByRole('button', { name: 'Favourite: ann' });
  expect(star).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(star);
  await vi.waitFor(() => expect(order()).toEqual(['ann', 'bob']));
  expect(screen.getByRole('button', { name: 'Favourite: ann' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  // The same favourites in a room's name menu.
  fireEvent.click(screen.getByRole('tab', { name: /^Rooms/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'ann' }));
  expect(screen.getByRole('menuitem', { name: 'Remove from favourites' })).toBeInTheDocument();
});

it('a fresh page shows the star still on, also on a search result', async () => {
  server.favourites = [ANN];
  await chatPage();
  const star = await screen.findByRole('button', { name: 'Favourite: ann' });
  await vi.waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
  expect(order()).toEqual(['ann', 'bob']);

  fireEvent.change(screen.getByRole('combobox', { name: 'Find a member' }), {
    target: { value: 'an' },
  });
  const stars = await screen.findByRole('list', { name: 'Favourite members' });
  expect(within(stars).getByRole('button', { name: 'Favourite: ann' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  // Same star drawing as in the rooms: the filled stroke star.
  expect(iconOf(within(stars).getByRole('button', { name: 'Favourite: ann' }))).toBe('star-filled');
  expect(iconOf(star)).toBe('star-filled');
});
