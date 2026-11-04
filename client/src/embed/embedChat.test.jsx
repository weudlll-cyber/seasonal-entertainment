// ============================================================
// File:        embedChat.test.jsx
// Path:        client/src/embed/embedChat.test.jsx
// Project:     Seasonal Entertainment
// Description: The embedded chat (/embed/chat): only the compact panel, without the site
//              shell, with the site's login state; guests follow the room's rules (a room they
//              may not read gives way to their first, as does a missing ?room=; none: "No
//              rooms available."); ?theme= is
//              shown without being stored; the postMessage API talks only to its own parent on
//              this origin (ready, unread while hidden; visible and theme from the host), and
//              ignores messages from any other origin or window; after an update of the site
//              it offers the new version as the site does (UpdateNotice.jsx).
// ============================================================

import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { CHECK_MS } from '../app/UpdateNotice.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { EMBED_SOURCE, HOST_SOURCE } from './embedProtocol.js';

const MIA = { id: 7, username: 'mia', role: 'member' };
const rooms = (list) => ({
  body: { ok: true, rooms: list, me: { guestName: null, moderator: false } },
});
const GENERAL = { slug: 'general', name: 'General', canWrite: true };
const MESSAGES = { body: { ok: true, messages: [] } };

// A framing page of this origin: another real window, standing in as window.parent.
let host;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  host = frame.contentWindow;
  vi.spyOn(host, 'postMessage');
  Object.defineProperty(window, 'parent', { value: host, configurable: true });
  // A game page of this same site frames the chat (what the browser reports as the parent).
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

function renderEmbed(query = 'room=general') {
  return render(
    <MemoryRouter initialEntries={[`/embed/chat?${query}`]}>
      <App />
    </MemoryRouter>
  );
}

const sentToHost = () =>
  host.postMessage.mock.calls.map(([message, origin]) => ({ ...message, origin }));
const fromWindow = (source, origin, data) =>
  act(() => window.dispatchEvent(new MessageEvent('message', { data, origin, source })));

it('shows only the panel, with the member signed in, and says ready', async () => {
  mockApi({
    ...signedIn(MIA),
    'GET /chat/rooms': rooms([GENERAL]),
    'GET /chat/rooms/general/messages': MESSAGES,
    'GET /keys/me': { body: { ok: true, key: null } },
  });
  renderEmbed();
  expect(await screen.findByRole('region', { name: 'Chat: General' })).toBeInTheDocument();
  // A member's composer: stickers and GIFs too. No site shell around it.
  expect(await screen.findByRole('button', { name: 'Emoji, stickers, GIFs' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Attach file' })).toBeInTheDocument(); // same site
  expect(screen.queryByRole('banner')).toBeNull();
  expect(screen.queryByRole('navigation')).toBeNull();
  await waitFor(() =>
    expect(sentToHost()).toContainEqual({
      source: EMBED_SOURCE,
      type: 'ready',
      room: 'general',
      signedIn: true,
      origin: window.location.origin, // never '*': a page on another origin gets nothing
    })
  );
});

it('lets a guest read and write where guests may; a room they may not read gives way', async () => {
  const calls = mockApi({
    ...GUEST,
    'GET /chat/rooms': rooms([GENERAL]),
    'GET /chat/rooms/general/messages': MESSAGES,
  });
  const { unmount } = renderEmbed('room=general');
  expect(await screen.findByRole('button', { name: 'Emoji' })).toBeInTheDocument(); // a guest's
  expect(screen.getByText(/You are a guest/)).toBeInTheDocument(); // on this site, guests write
  expect(screen.queryByRole('button', { name: 'Log in to write' })).toBeNull();
  unmount();
  host.postMessage.mockClear(); // the first frame's ready named general too

  // Members only: not in a guest's list, so the guest's first room opens, with the neutral note
  // (the same as for a room that does not exist), and the host hears which room shows.
  renderEmbed('room=seasonal-race');
  const panel = await screen.findByRole('region', { name: 'Chat: General' });
  expect(within(panel).getByRole('status')).toHaveTextContent("This room isn't available.");
  expect(calls.some((c) => c.key.startsWith('GET /chat/rooms/seasonal-race/'))).toBe(false);
  await waitFor(() =>
    expect(sentToHost()).toContainEqual(
      expect.objectContaining({ type: 'ready', room: 'general', signedIn: false })
    )
  );
});

it('says "No rooms available." to a reader without any room', async () => {
  mockApi({
    ...GUEST,
    'GET /chat/rooms': rooms([]),
  });
  renderEmbed('');
  expect(await screen.findByText('No rooms available.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows ?theme= without storing it, and takes a theme from its host only', async () => {
  mockApi({
    ...GUEST,
    'GET /chat/rooms': rooms([GENERAL]),
    'GET /chat/rooms/general/messages': MESSAGES,
  });
  renderEmbed('room=general&theme=dark');
  await screen.findByRole('region', { name: 'Chat: General' });
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(window.localStorage.getItem('se.theme')).toBeNull();

  const light = { source: HOST_SOURCE, type: 'theme', theme: 'light' };
  fromWindow(host, 'https://evil.example', light); // another origin
  fromWindow(window, window.location.origin, light); // not the parent
  fromWindow(host, window.location.origin, { ...light, source: 'someone-else' }); // not the host
  expect(document.documentElement.dataset.theme).toBe('dark');
  fromWindow(host, window.location.origin, light);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
});

it('counts new messages while its host has it out of sight', async () => {
  mockApi({
    ...GUEST,
    'GET /chat/rooms': rooms([GENERAL]),
    'GET /chat/rooms/general/messages': MESSAGES,
  });
  renderEmbed();
  await screen.findByRole('region', { name: 'Chat: General' });
  const hide = { source: HOST_SOURCE, type: 'visible', visible: false };
  fromWindow(host, 'https://evil.example', hide); // ignored: still in sight, nothing counted
  fromWindow(host, window.location.origin, hide);
  await waitFor(() => expect(FakeSocket.all.at(-1)?.readyState).toBe(1));
  const message = { id: 1, room: 'general', author: 'zoe', body: 'hi', kind: 'text' };
  FakeSocket.all.at(-1).push({ type: 'message', room: 'general', message });
  await waitFor(() =>
    expect(sentToHost()).toContainEqual(expect.objectContaining({ type: 'unread', count: 1 }))
  );
});

it('offers the new version after an update of the site, as the site does', async () => {
  vi.stubEnv('SE_BUILD_COMMIT', 'aaaaaaaaaaaa');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    mockApi({
      ...signedIn(MIA),
      'GET /chat/rooms': rooms([GENERAL]),
      'GET /chat/rooms/general/messages': MESSAGES,
      'GET /keys/me': { body: { ok: true, key: null } },
      'GET /health': { body: { ok: true, version: '0.1.0', commit: 'bbbbbbbbbbbb' } },
    });
    renderEmbed();
    await screen.findByRole('region', { name: 'Chat: General' });
    expect(screen.queryByText(/A new version/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(CHECK_MS));
    expect(await screen.findByText('A new version of the chat is available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});
