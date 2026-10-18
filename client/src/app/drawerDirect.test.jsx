// ============================================================
// File:        drawerDirect.test.jsx
// Path:        client/src/app/drawerDirect.test.jsx
// Project:     Seasonal Entertainment
// Description: The chat drawer's Direct tab: guests have no tabs (no direct messages); a member
//              whose key is not unlocked on this device sees "Unlock private messages"; "Send
//              private message" in a name menu opens that conversation on the Direct tab; the
//              unread count of a conversation (also on the chat button and the Direct tab)
//              clears once it was read, in this tab and, through the server's "read" event, any.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import App from './App.jsx';
import { showDirect } from '../chat/directView.js';
import { browserKey, keyServer } from '../test/keyServer.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { resetDevice } from '../test/memoryDeviceKey.js';
import { GUEST, PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

vi.mock('../keys/deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const MIA = { id: 1, username: 'mia', role: 'member' };
const ROOMS = [{ slug: 'general', name: 'General', canWrite: true }];
const zoeSays = {
  id: 3,
  room: 'general',
  author: 'zoe',
  authorId: 8,
  isGuest: false,
  kind: 'text',
  body: 'hi all',
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-18T09:00:00.000Z',
  hiddenAt: null,
};

beforeEach(() => {
  localStorage.clear();
  resetDevice();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
});

// The drawer on /games, opened. unlocked: this device holds mia's key.
async function drawerFor(session, { unlocked = false, unread = 0 } = {}) {
  const { authKey, wrapKey } = await deriveAccountKeys('correct-horse-1', PRELOGIN_SALT);
  const { key, privateKey } = await browserKey(wrapKey);
  if (unlocked) resetDevice({ userId: 1, keyId: key.keyId, privateKey });
  const server = keyServer(authKey, key);
  const state = { unread };
  const calls = mockApi({
    ...session,
    ...PRELOGIN,
    ...server.answers,
    'GET /chat/rooms': {
      body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [zoeSays] } },
    'GET /chat/favourites': { body: { ok: true, rooms: [], users: [] } },
    'GET /chat/direct': () => ({
      body: {
        ok: true,
        conversations: [
          {
            partner: { id: 8, username: 'zoe', online: true },
            favourite: false,
            lastMessageAt: '2026-10-18T09:00:00.000Z',
          },
        ],
      },
    }),
    'GET /chat/direct/8': {
      body: {
        ok: true,
        partner: { id: 8, username: 'zoe', online: true },
        partnerKey: null,
        keys: {},
        messages: [
          {
            id: 5,
            senderId: 8,
            recipientId: 1,
            senderKeyId: 9,
            recipientKeyId: 2,
            nonce: 'AA==',
            ciphertext: 'AA==',
            createdAt: '2026-10-18T09:00:00.000Z',
          },
        ],
      },
    },
    'GET /chat/unread': () => ({
      body: {
        ok: true,
        rooms: [],
        direct: state.unread ? [{ partnerId: 8, count: state.unread }] : [],
      },
    }),
    'POST /chat/direct/8/read': () => {
      state.unread = 0;
      return { body: { ok: true } };
    },
    'GET /games': { body: { ok: true, games: [] } },
  });
  render(
    <MemoryRouter initialEntries={['/games']}>
      <App />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /^Chat(:|$)/ }));
  return { drawer: screen.getByRole('dialog', { name: 'Chat' }), calls };
}

it('guests have no tabs: no direct messages', async () => {
  const { drawer } = await drawerFor(GUEST);
  await within(drawer).findByText('hi all');
  expect(within(drawer).queryByRole('tablist', { name: 'Chat' })).toBeNull();
});

it('a locked device asks to unlock in the Direct tab', async () => {
  const { drawer } = await drawerFor(signedIn(MIA));
  fireEvent.click(await within(drawer).findByRole('tab', { name: 'Direct' }));
  expect(
    await within(drawer).findByRole('button', { name: 'Unlock private messages' })
  ).toBeInTheDocument();
});

it('"Send private message" opens that conversation on the Direct tab', async () => {
  const { drawer } = await drawerFor(signedIn(MIA), { unlocked: true });
  fireEvent.click(await within(drawer).findByRole('button', { name: 'zoe' }));
  fireEvent.click(within(drawer).getByRole('menuitem', { name: 'Send private message' }));
  expect(within(drawer).getByRole('tab', { name: 'Direct' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  expect(
    await within(drawer).findByRole('list', { name: 'Private messages with zoe' })
  ).toBeInTheDocument();
  expect(within(drawer).getByText('zoe cannot receive private messages yet.')).toBeInTheDocument();
});

it('the unread count clears once the conversation was read', async () => {
  const { drawer, calls } = await drawerFor(signedIn(MIA), { unlocked: true, unread: 3 });
  expect(
    await screen.findByRole('button', { name: 'Chat: 3 unread private messages' })
  ).toBeInTheDocument();
  fireEvent.click(await within(drawer).findByRole('tab', { name: /Direct/ }));
  expect(within(drawer).getByRole('tab', { name: /^Direct ?3 unread$/ })).toBeInTheDocument();
  const row = await within(drawer).findByRole('button', { name: /zoe/ });
  expect(within(row).getByRole('img', { name: '3 unread from zoe' })).toBeInTheDocument();
  fireEvent.click(row);
  await vi.waitFor(() =>
    expect(calls.find((c) => c.key === 'POST /chat/direct/8/read')?.body).toEqual({ lastId: 5 })
  );
  // The server tells all of the member's sockets; every counter on the page recounts.
  act(() => FakeSocket.all.at(-1).push({ type: 'read' }));
  expect(await screen.findByRole('button', { name: 'Chat' })).toBeInTheDocument();
  fireEvent.click(within(drawer).getByRole('button', { name: 'All private conversations' }));
  const again = await within(drawer).findByRole('button', { name: /zoe/ });
  expect(within(again).queryByRole('img')).toBeNull();
});
