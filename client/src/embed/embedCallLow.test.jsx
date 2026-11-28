// ============================================================
// File:        embedCallLow.test.jsx
// Path:        client/src/embed/embedCallLow.test.jsx
// Project:     Seasonal Entertainment
// Description: The call view in a desktop game's low docked strip (a frame 267 x 94): one row
//              with Listen or Mute, Leave and Open the call page, never Collapse or Expand; the
//              state, who speaks or the error in its one line. A phone's strip keeps Expand.
//              The sizes themselves are measured in a real browser
//              (client/e2e/embedLow.spec.js).
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { rooms } from '../test/fakeLiveKit.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));
// The framing game and its window (desktop or phone), which jsdom cannot give a frame.
const game = vi.hoisted(() => ({ phone: false }));
vi.mock('./callView.js', async (actual) => ({
  ...(await actual()),
  framingGame: () => 'bingo',
  onPhone: () => game.phone,
}));

const size = { width: window.innerWidth, height: window.innerHeight };
const resize = (width, height) => {
  window.innerWidth = width;
  window.innerHeight = height;
};
beforeEach(() => {
  rooms.length = 0;
  game.phone = false;
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  resize(267, 94);
});
afterEach(() => resize(size.width, size.height));

const answers = (join) => ({
  ...GUEST,
  'GET /calls/7': {
    body: {
      ok: true,
      call: { id: 7, title: 'Town hall', status: 'live', recording: false },
      canManage: false,
    },
  },
  'POST /calls/7/join': join ?? {
    body: { ok: true, url: 'wss://calls.test', token: 'tok', identity: 'p-me' },
  },
});
const renderView = () =>
  render(
    <MemoryRouter initialEntries={['/embed/call/7']}>
      <App />
    </MemoryRouter>
  );
const button = (name) => screen.queryByRole('button', { name });

it('is one row: Listen, then Mute and Leave, the call page; no Collapse or Expand', async () => {
  mockApi(answers());
  renderView();
  const listen = await screen.findByRole('button', { name: 'Listen' });
  expect(screen.getByRole('main').classList.contains('embed-call--low')).toBe(true);
  expect(screen.getByRole('link', { name: 'Open the call page' })).toBeTruthy();
  expect(button('Leave')).toBeNull();
  expect(button('Expand')).toBeNull();
  expect(button('Collapse')).toBeNull();
  fireEvent.click(listen);
  fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
  expect((await screen.findByRole('status')).textContent).toBe('You left the call.');
});

it('says in its line why joining failed', async () => {
  mockApi(
    answers({
      status: 403,
      body: { ok: false, error: 'call_full', message: 'This call is full.' },
    })
  );
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Listen' }));
  expect(await screen.findByText('This call is full.')).toBeTruthy();
});

it("leaves a phone's strip as it was, with Expand", async () => {
  game.phone = true;
  resize(390, 48);
  mockApi(answers());
  renderView();
  await screen.findByRole('button', { name: 'Listen' });
  expect(button('Expand')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Open the call page' })).toBeNull();
});
