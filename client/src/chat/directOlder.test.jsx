// ============================================================
// File:        directOlder.test.jsx
// Path:        client/src/chat/directOlder.test.jsx
// Project:     Seasonal Entertainment
// Description: Older direct messages: reaching the top of a conversation (or "Load older
//              messages") loads the page before the oldest shown, decrypted in the browser with
//              the keys that page names; the reader stays on the message they were looking at;
//              a key change inside the older page still gets its notice; a live reload keeps
//              the older page; with nothing older there is no button.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { storedDirect } from '../test/directFixtures.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const MIA = { id: 1, username: 'mia', role: 'member' };
const ZOE = { id: 8, username: 'zoe' };
const ROW_PX = 100; // every row of the stand-in layout
let mia;
let zoe;
let zoeOld;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
  [mia, zoe, zoeOld] = [await newKeyPair(), await newKeyPair(), await newKeyPair()];
});

const fromZoe = (id, pair, keyId, text) =>
  storedDirect(id, { id: 8, pair, keyId }, { id: 1, publicKey: mia.publicKey, keyId: 1 }, { text });
const fromMia = (id, text) =>
  storedDirect(
    id,
    { id: 1, pair: mia, keyId: 1 },
    { id: 8, publicKey: zoe.publicKey, keyId: 9 },
    { text }
  );

// A conversation page as the server sends it.
const page = (messages, more, keys) => ({
  body: {
    ok: true,
    partner: { ...ZOE, online: false },
    partnerKey: { keyId: 9, publicKey: zoe.publicKey },
    keys,
    messages,
    more,
  },
});

// jsdom lays nothing out: a list whose height is its number of rows times ROW_PX, with a
// scroll position of its own.
function fakeLayout(list) {
  let top = 0;
  Object.defineProperties(list, {
    scrollHeight: { get: () => list.children.length * ROW_PX },
    clientHeight: { get: () => 150 },
    scrollTop: {
      get: () => top,
      set: (value) => {
        top = value;
      },
    },
  });
}

async function open({ olderMore = false } = {}) {
  const newest = [
    await fromZoe(201, zoe, 9, 'newest from zoe'),
    await fromMia(202, 'newest reply'),
  ];
  const older = [
    await fromZoe(101, zoeOld, 7, 'oldest hello'),
    await fromZoe(102, zoe, 9, 'after the key change'),
  ];
  const keys = { 7: zoeOld.publicKey, 9: zoe.publicKey, 1: mia.publicKey };
  // The newest page as it is now; a test adds to it (a message that arrives later).
  const calls = mockApi({
    ...signedIn(MIA),
    'GET /chat/direct/8': () => page([...newest], true, { 9: zoe.publicKey, 1: mia.publicKey }),
    'GET /chat/direct/8?before=201': page(older, olderMore, keys),
    'POST /chat/direct/8/read': { body: { ok: true } },
  });
  act(() => showDirect(ZOE));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  await within(list).findByText('newest from zoe');
  return { calls, list, newest };
}

const texts = (list) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.textContent);

it('reaching the top loads the older page above, and the reader stays where they were', async () => {
  const { calls, list } = await open();
  fakeLayout(list);
  expect(within(list).getByRole('button', { name: 'Load older messages' })).toBeInTheDocument();
  // 3 rows (the button, 2 messages); the reader scrolls to the very top.
  list.scrollTop = 0;
  fireEvent.scroll(list);

  await within(list).findByText('oldest hello');
  expect(calls.map((c) => c.key)).toContain('GET /chat/direct/8?before=201');
  // Above the reader now: 2 older messages and a key notice, the button gone (5 rows). The
  // newest message is still 300 px from the bottom, as before.
  expect(list.scrollHeight).toBe(5 * ROW_PX);
  expect(list.scrollTop).toBe(5 * ROW_PX - 3 * ROW_PX);
  expect(within(list).queryByRole('button', { name: /older messages/ })).toBeNull();
});

it('keeps the order and the key notice inside the older page; a live reload keeps it', async () => {
  const { list, newest } = await open({ olderMore: true });
  fireEvent.click(within(list).getByRole('button', { name: 'Load older messages' }));
  await within(list).findByText('oldest hello');
  const order = (list_) =>
    texts(list_).filter((t) => /oldest hello|key changed|after the key|newest/.test(t));
  const expected = [
    expect.stringContaining('oldest hello'),
    "zoe's security key changed",
    expect.stringContaining('after the key change'),
    expect.stringContaining('newest from zoe'),
    expect.stringContaining('newest reply'),
  ];
  expect(order(list)).toEqual(expected);
  // Still more before these: the button stays.
  expect(within(list).getByRole('button', { name: 'Load older messages' })).toBeEnabled();

  // A new message arrives: the newest page is loaded again, the older one stays.
  newest.push(await fromZoe(203, zoe, 9, 'newest arrival'));
  FakeSocket.all.at(-1).push({ type: 'direct', message: { id: 203 } });
  await within(list).findByText('newest arrival');
  expect(order(list)).toEqual([...expected, expect.stringContaining('newest arrival')]);
});

it('offers nothing older when the conversation fits one page', async () => {
  mockApi({
    ...signedIn(MIA),
    'GET /chat/direct/8': page([await fromMia(5, 'only one')], false, { 9: zoe.publicKey }),
    'POST /chat/direct/8/read': { body: { ok: true } },
  });
  act(() => showDirect(ZOE));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  await within(list).findByText('only one');
  expect(within(list).queryByRole('button', { name: /older messages/ })).toBeNull();
});
