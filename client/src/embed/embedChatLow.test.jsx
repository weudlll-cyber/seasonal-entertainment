// ============================================================
// File:        embedChatLow.test.jsx
// Path:        client/src/embed/embedChatLow.test.jsx
// Project:     Seasonal Entertainment
// Description: The embedded chat in a frame under 120 px (a game's docked strip): the newest
//              three messages as plain one-line rows, a channel picker instead of the tabs that
//              switches rooms and says so to the game, private messages as a link to the chat
//              page, and the usual form again once the frame grows. The sizes themselves are
//              measured in a real browser (client/e2e/embedLow.spec.js).
// ============================================================

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, NO_KEY, mockApi, signedIn } from '../test/mockApi.js';
import { LOW_CHAT_QUERY } from './useLowFrame.js';

const MIA = { id: 7, username: 'mia', role: 'member' };
const ROOMS = [
  { slug: 'general', name: 'General', canWrite: true },
  { slug: 'race', name: 'Race', canWrite: true },
  { slug: 'news', name: 'News', canWrite: false },
];
const rooms = { body: { ok: true, rooms: ROOMS, me: { guestName: null, moderator: false } } };
const message = (id, fields) => ({
  id,
  author: `user${id}`,
  authorId: id,
  authorSteps: [],
  isGuest: false,
  isSystem: false,
  kind: 'text',
  body: `message ${id}`,
  mentions: [],
  createdAt: '2026-11-28T10:00:00Z',
  ...fields,
});
const list = (...messages) => ({ body: { ok: true, messages } });
const answers = (session) => ({
  ...session,
  ...NO_KEY,
  'GET /chat/rooms': rooms,
  'GET /chat/rooms/general/messages': list(
    message(1),
    message(2, { isGuest: true, body: 'see https://example.org/a' }),
    message(3, { authorRole: 'admin' }),
    message(4, { kind: 'sticker', body: '', media: null })
  ),
  'GET /chat/rooms/race/messages': list(message(9, { body: 'go' })),
  'GET /chat/rooms/news/messages': list(),
  'POST /chat/rooms/general/read': { body: { ok: true } },
  'POST /chat/rooms/race/read': { body: { ok: true } },
});

// The frame's height, as the browser's media query reports it; setLow() changes it.
let low;
let listeners;
const setLow = (value) =>
  act(() => {
    low = value;
    listeners.forEach((changed) => changed());
  });

let host;
beforeEach(() => {
  low = true;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (query) => ({
    get matches() {
      return query === LOW_CHAT_QUERY && low;
    },
    addEventListener: (type, changed) => listeners.add(changed),
    removeEventListener: (type, changed) => listeners.delete(changed),
  }));
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  host = frame.contentWindow;
  vi.spyOn(host, 'postMessage');
  Object.defineProperty(window, 'parent', { value: host, configurable: true });
  Object.defineProperty(document, 'referrer', {
    value: `${window.location.origin}/games/race`,
    configurable: true,
  });
});
afterEach(() => {
  Object.defineProperty(window, 'parent', { value: window, configurable: true });
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  window.localStorage.clear();
});

const renderEmbed = () =>
  render(
    <MemoryRouter initialEntries={['/embed/chat?room=general']}>
      <App />
    </MemoryRouter>
  );
const rows = (name = 'General') =>
  within(screen.getByRole('list', { name: `Messages in ${name}` })).queryAllByRole('listitem');
const picker = () => screen.findByRole('combobox', { name: 'Channel' });

it('shows the newest three as plain rows, the picker and the input, no tabs', async () => {
  mockApi(answers(signedIn(MIA)));
  renderEmbed();
  await picker();
  await waitFor(() => expect(rows()).toHaveLength(3));
  expect(rows().map((row) => row.textContent)).toEqual([
    'user2Guestsee https://example.org/a',
    'user3Adminmessage 3',
    'user4Sticker',
  ]);
  expect(rows()[0].title).toBe('user2: see https://example.org/a');
  const log = screen.getByRole('list', { name: 'Messages in General' });
  expect(within(log).queryAllByRole('button')).toEqual([]);
  expect(within(log).queryAllByRole('link')).toEqual([]);
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('switches rooms with the picker and tells the game the room shown', async () => {
  mockApi(answers(signedIn(MIA)));
  renderEmbed();
  const select = await picker();
  await waitFor(() => expect(select.value).toBe('general'));
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'General',
    'Race',
    'News',
    'Private messages',
  ]);
  fireEvent.change(select, { target: { value: 'race' } });
  await waitFor(() => expect(rows('Race')[0].textContent).toBe('user9go'));
  await waitFor(() =>
    expect(
      host.postMessage.mock.calls.map(([m]) => m).filter((m) => m.type === 'ready')
    ).toContainEqual(expect.objectContaining({ room: 'race', signedIn: true }))
  );
  // A room the member only reads: the picker stays beside the line that says so.
  fireEvent.change(await picker(), { target: { value: 'news' } });
  await screen.findByText('You can read this room, but not write in it.');
  expect(screen.getByRole('combobox', { name: 'Channel' }).value).toBe('news');
});

it('offers private messages as a link to the chat page', async () => {
  mockApi(answers(signedIn(MIA)));
  renderEmbed();
  const select = await picker();
  await waitFor(() => expect(select.value).toBe('general'));
  fireEvent.change(select, { target: { value: '@direct' } });
  const link = screen.getByRole('link', { name: 'Open the chat page' });
  expect(link.getAttribute('href')).toBe('/chat');
  expect(link.getAttribute('target')).toBe('_blank');
  fireEvent.change(screen.getByRole('combobox', { name: 'Channel' }), {
    target: { value: 'general' },
  });
  expect(await screen.findByRole('list', { name: 'Messages in General' })).toBeTruthy();
});

it('offers a guest the rooms, without private messages', async () => {
  mockApi(answers(GUEST));
  renderEmbed();
  const select = await picker();
  await waitFor(() => expect(select.options).toHaveLength(3));
  expect(screen.queryByRole('option', { name: 'Private messages' })).toBeNull();
});

it('is the usual chat again once the frame is high enough', async () => {
  mockApi(answers(signedIn(MIA)));
  renderEmbed();
  await picker();
  const field = screen.getByRole('textbox', { name: 'Message' });
  fireEvent.change(field, { target: { value: 'half written' } });
  setLow(false);
  expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull();
  expect(screen.getByRole('tablist')).toBeTruthy();
  await waitFor(() => expect(rows()).toHaveLength(4));
  // The same field: what was written stays.
  expect(screen.getByRole('textbox', { name: 'Message' }).value).toBe('half written');
});
