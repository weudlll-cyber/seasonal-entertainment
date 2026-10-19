// ============================================================
// File:        foreignEmbed.jsx
// Path:        client/src/test/foreignEmbed.jsx
// Project:     Seasonal Entertainment
// Description: Test helpers for the chat embedded on another site's page (client/src/embed/):
//              the game page as the frame's parent (a real window, its postMessage recorded),
//              the referrer naming that site, window.open returning a stand-in popup window,
//              the API answers of a guest frame, rendering the embed from a fresh client, and
//              the popup's hand-over. Each test loads the client afresh (setUpForeignHost):
//              the embed's state lives as long as its page.
// ============================================================

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, vi } from 'vitest';
import { FakeSocket } from './fakeSocket.js';
import { GUEST } from './mockApi.js';

export const SITE = 'https://game.example';
export const TOKEN = 'an-embed-token-for-the-game-page';
export const MIA = { id: 1, username: 'mia', role: 'member' };
export const ZOE = { id: 8, username: 'zoe' };
const GENERAL = { slug: 'general', name: 'General', canWrite: true };
// The game page (the parent) and the login window the embed opens, for the running test.
export const page = { host: null, popup: null };

// Call in beforeEach: a fresh client, the frame inside the game page, window.open stubbed.
export function setUpForeignHost() {
  vi.resetModules();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  const frames = [document.createElement('iframe'), document.createElement('iframe')];
  document.body.append(...frames);
  [page.host, page.popup] = frames.map((f) => f.contentWindow);
  vi.spyOn(page.host, 'postMessage');
  Object.defineProperty(window, 'parent', { value: page.host, configurable: true });
  Object.defineProperty(document, 'referrer', { value: `${SITE}/play`, configurable: true });
  vi.stubGlobal(
    'open',
    vi.fn(() => page.popup)
  );
}
// Call in afterEach.
export function tearDownForeignHost() {
  Object.defineProperty(window, 'parent', { value: window, configurable: true });
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  vi.unstubAllGlobals();
}

export const answers = (allowed, extra = {}) => ({
  ...GUEST,
  [`GET /embed/check?origin=${encodeURIComponent(SITE)}`]: { body: { ok: true, allowed } },
  'GET /chat/rooms': {
    body: { ok: true, rooms: [GENERAL], me: { guestName: null, moderator: false } },
  },
  'GET /chat/rooms/general/messages': { body: { ok: true, messages: [] } },
  'GET /chat/unread': { body: { ok: true, rooms: [], direct: [] } },
  ...extra,
});

export async function showEmbed() {
  const { default: App } = await import('../app/App.jsx');
  render(
    <MemoryRouter initialEntries={['/embed/chat?room=general']}>
      <App />
    </MemoryRouter>
  );
}

export const sentToHost = () => page.host.postMessage.mock.calls;
export const fromWindow = (source, origin, data) =>
  act(() => window.dispatchEvent(new MessageEvent('message', { data, origin, source })));
export const handOver = (extra = {}) => ({
  source: 'seasonal-chat-login',
  type: 'login',
  origin: SITE,
  token: TOKEN,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: MIA,
  key: null,
  ...extra,
});

export async function logIn(key = null) {
  const button = await screen.findByRole('button', { name: 'Log in' });
  await waitFor(() => expect(button).toBeEnabled()); // once the parent is verified
  fireEvent.click(button);
  expect(window.open).toHaveBeenCalledWith(
    `/embed-login?origin=${encodeURIComponent(SITE)}`,
    'se-embed-login',
    expect.any(String)
  );
  fromWindow(page.popup, window.location.origin, handOver({ key }));
  await screen.findByRole('button', { name: 'Log out' });
}
