// ============================================================
// File:        embedChat.test.jsx
// Path:        client/src/embed/embedChat.test.jsx
// Project:     Seasonal Entertainment
// Description: The embedded chat (/embed/chat): only the compact panel, without the site
//              shell, with the site's login state; guests follow the room's rules; ?theme= is
//              shown without being stored; the postMessage API talks only to its own parent on
//              this origin (ready, unread while hidden; visible and theme from the host), and
//              ignores messages from any other origin or window.
// ============================================================

import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
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

it('lets a guest read and write where guests may, and nothing where they may not', async () => {
  mockApi({
    ...GUEST,
    'GET /chat/rooms': rooms([GENERAL]),
    'GET /chat/rooms/general/messages': MESSAGES,
    'GET /chat/rooms/seasonal-race/messages': {
      status: 404,
      body: { ok: false, error: 'not_found', message: 'No such room.' },
    },
  });
  const { unmount } = renderEmbed('room=general');
  expect(await screen.findByRole('button', { name: 'Emoji' })).toBeInTheDocument(); // a guest's
  unmount();

  renderEmbed('room=seasonal-race');
  expect(await screen.findByText('No such room.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Message')).toBeNull();
  await waitFor(() =>
    expect(sentToHost()).toContainEqual(expect.objectContaining({ type: 'ready', signedIn: false }))
  );
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
