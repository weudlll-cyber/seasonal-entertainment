// ============================================================
// File:        privacySettings.test.jsx
// Path:        client/src/components/privacySettings.test.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Privacy" section: "Show when I'm online" is a switch, on by
//              default; turning it off sends only the setting and shows the stored state; a
//              "presence" event (someone changed theirs) reloads the online marks of the
//              Direct list and the favourites.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { DirectPanel } from '../chat/index.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';

const MIA = { id: 1, username: 'mia', email: 'mia@example.org', role: 'member' };

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

it('the switch is on by default, and off once switched off', async () => {
  let showOnline = true;
  const calls = mockApi({
    'GET /auth/session': () => ({ body: { ok: true, user: { ...MIA, showOnline } } }),
    'PUT /auth/privacy': (sent) => {
      showOnline = sent.showOnline;
      return { body: { ok: true } };
    },
  });
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App />
    </MemoryRouter>
  );
  const toggle = await screen.findByRole('switch', { name: "Show when I'm online" });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  await vi.waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
  expect(calls.find((c) => c.key === 'PUT /auth/privacy').body).toEqual({ showOnline: false });
});

it('a "presence" event reloads the online marks', async () => {
  let online = true;
  const calls = mockApi({
    ...signedIn(MIA),
    'GET /chat/direct': () => ({
      body: {
        ok: true,
        conversations: [
          { partner: { id: 8, username: 'zoe', online }, favourite: true, lastMessageAt: null },
        ],
      },
    }),
    'GET /chat/favourites': () => ({
      body: { ok: true, rooms: [], users: [{ id: 8, username: 'zoe', online }] },
    }),
  });
  const { privateKey } = await newKeyPair();
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={privateKey} />
    </SessionProvider>
  );
  expect(await screen.findByText('online')).toBeInTheDocument();
  // The live connection and the favourites wait for the session; the list may show before.
  await vi.waitFor(() => expect(FakeSocket.all.length).toBeGreaterThan(0));
  await vi.waitFor(() => expect(calls.some((c) => c.key === 'GET /chat/favourites')).toBe(true));
  online = false;
  const before = calls.filter((c) => c.key === 'GET /chat/favourites').length;
  act(() => FakeSocket.all.at(-1).push({ type: 'presence' }));
  await vi.waitFor(() => expect(screen.queryByText('online')).toBeNull());
  await vi.waitFor(() =>
    expect(calls.filter((c) => c.key === 'GET /chat/favourites').length).toBe(before + 1)
  );
});
