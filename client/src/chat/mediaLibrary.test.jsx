// ============================================================
// File:        mediaLibrary.test.jsx
// Path:        client/src/chat/mediaLibrary.test.jsx
// Project:     Seasonal Entertainment
// Description: The sticker/GIF library is loaded once per page and shared: a direct
//              conversation that shows a sticker and the picker opened in it ask the server
//              once between them; a failed load is not kept, so the next use loads again.
//              Each test starts with a fresh module graph (the library lives for the page).
// ============================================================

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { storedDirect } from '../test/directFixtures.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';

const MIA = { id: 1, username: 'mia', role: 'member' };
const ZOE = { id: 8, username: 'zoe' };
const ITEM = {
  id: 11,
  name: 'Spring badge',
  alt: 'Spring badge picture',
  credit: null,
  url: '/media/11.webp',
  width: 512,
  height: 512,
};
const PACKS = [{ id: 1, name: 'Seasons', kind: 'sticker', items: [ITEM] }];

beforeEach(() => {
  vi.resetModules();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const libraryLoads = (calls) => calls.filter((c) => c.key === 'GET /chat/media').length;

it('a conversation with a sticker and its picker load the library once between them', async () => {
  const { DirectPanel } = await import('./index.js');
  const { showDirect } = await import('./directView.js');
  const { SessionProvider } = await import('../session/SessionContext.jsx');
  const [mia, zoe] = [await newKeyPair(), await newKeyPair()];
  const sticker = await storedDirect(
    5,
    { id: 8, pair: zoe, keyId: 9 },
    { id: 1, publicKey: mia.publicKey, keyId: 1 },
    { text: '', mediaItemId: 11 }
  );
  const calls = mockApi({
    ...signedIn(MIA),
    'GET /chat/direct/8': {
      body: {
        ok: true,
        partner: { ...ZOE, online: false },
        partnerKey: { keyId: 9, publicKey: zoe.publicKey },
        keys: { 9: zoe.publicKey },
        messages: [sticker],
        more: false,
      },
    },
    'POST /chat/direct/8/read': { body: { ok: true } },
    'GET /chat/media': { body: { ok: true, packs: PACKS } },
  });
  act(() => showDirect(ZOE));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  expect(await within(list).findByRole('img', { name: 'Spring badge picture' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Emoji, stickers, GIFs' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
  expect(await screen.findByRole('button', { name: /Spring badge/ })).toBeInTheDocument();
  expect(libraryLoads(calls)).toBe(1);
});

it('forgets a failed load, so the next use loads again', async () => {
  const { useMediaLibrary } = await import('./mediaLibrary.js');
  let fail = true;
  const calls = mockApi({
    'GET /chat/media': () =>
      fail
        ? { status: 500, body: { ok: false, error: 'server', message: 'Library down.' } }
        : { body: { ok: true, packs: PACKS } },
  });
  const first = renderHook(() => useMediaLibrary(true));
  await waitFor(() => expect(first.result.current.error).toBe('Library down.'));

  fail = false;
  const second = renderHook(() => useMediaLibrary(true));
  await waitFor(() => expect(second.result.current.packs).toEqual(PACKS));
  expect(libraryLoads(calls)).toBe(2);
});
