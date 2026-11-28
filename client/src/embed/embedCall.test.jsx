// ============================================================
// File:        embedCall.test.jsx
// Path:        client/src/embed/embedCall.test.jsx
// Project:     Seasonal Entertainment
// Description: The call view inside a game (/embed/call/:id, EmbedCallPage.jsx;
//              docs/GAME-INTEGRATION.md section 9) with stand-ins for livekit-client and the
//              framing game: outside a game only the link to the call page; in one it says
//              ready, connects only on Listen and as a listener (listenOnly), says live,
//              speaking, resize and ended, mutes on its own button and on the game's message,
//              collapses and expands, leaves, asks about a recording first (and says error when
//              declined), drops the picture while out of sight but keeps the sound, and ignores
//              messages from another origin, window or source.
// ============================================================

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { fakeTrack } from '../calls/testRoom.js';
import { rooms } from '../test/fakeLiveKit.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { CALL_HOST_SOURCE, CALL_SOURCE } from './callView.js';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));
// The framing game: a stand-in for the parent's location, which jsdom cannot give a frame.
const framing = vi.hoisted(() => ({ game: 'bingo' }));
vi.mock('./callView.js', async (actual) => ({
  ...(await actual()),
  framingGame: () => framing.game,
  onPhone: () => false,
}));

let host;
beforeEach(() => {
  rooms.length = 0;
  framing.game = 'bingo';
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  host = frame.contentWindow;
  vi.spyOn(host, 'postMessage');
  Object.defineProperty(window, 'parent', { value: host, configurable: true });
});
afterEach(() => {
  Object.defineProperty(window, 'parent', { value: window, configurable: true });
});

const CALL = (status, extra = {}) => ({
  id: 7,
  title: 'Town hall',
  status,
  recording: false,
  recordingState: null,
  ...extra,
});
const JOINED = { body: { ok: true, url: 'wss://calls.test', token: 'tok', identity: 'p-me' } };
const answers = (status, join = JOINED) => ({
  'GET /calls/7': { body: { ok: true, call: CALL(status), canManage: false } },
  'POST /calls/7/join': join,
});

const renderView = () =>
  render(
    <MemoryRouter initialEntries={['/embed/call/7?theme=dark']}>
      <App />
    </MemoryRouter>
  );
const sent = () => host.postMessage.mock.calls.map(([message, origin]) => ({ ...message, origin }));
const sentOf = (type) => sent().filter((m) => m.type === type);
const fromGame = (data, { origin = window.location.origin, source = host } = {}) =>
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', { data: { source: CALL_HOST_SOURCE, ...data }, origin, source })
    )
  );
// A speaker on the stage with a microphone, as LiveKit reports one.
function speakerJoins(room) {
  const olga = {
    identity: 'p-olga',
    name: 'olga',
    attributes: { kind: 'host' },
    permissions: { canPublish: true },
    audioTrackPublications: new Map([['TR1', { trackSid: 'TR1', track: fakeTrack() }]]),
    getTrackPublication: () => undefined,
  };
  act(() => {
    room.remoteParticipants.set(olga.identity, olga);
    room.emit('participantConnected');
  });
  return olga;
}
async function listen() {
  fireEvent.click(await screen.findByRole('button', { name: 'Listen' }));
  return screen.findByRole('button', { name: 'Leave' });
}

it('outside a game: only the link to the call page, nothing asked, nothing said', async () => {
  framing.game = null;
  const calls = mockApi({ ...GUEST });
  renderView();
  const link = await screen.findByRole('link', { name: 'Open the call page' });
  expect(link.getAttribute('href')).toBe('/calls/7');
  expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
  // No view at all: none of its controls.
  expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
  expect(calls.some((c) => c.key.startsWith('GET /calls'))).toBe(false);
  expect(sent()).toEqual([]);
});

it('says ready, connects only on Listen, as a listener, and says live', async () => {
  const calls = mockApi({ ...signedIn({ username: 'mia', role: 'admin' }), ...answers('live') });
  renderView();
  await waitFor(() =>
    expect(sentOf('ready')).toEqual([
      {
        source: CALL_SOURCE,
        type: 'ready',
        call: 7,
        status: 'live',
        signedIn: true,
        origin: window.location.origin,
      },
    ])
  );
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  await screen.findByRole('button', { name: 'Listen' });
  expect(rooms).toHaveLength(0);
  await listen();
  expect(calls.find((c) => c.key === 'POST /calls/7/join').body).toEqual({ listenOnly: true });
  expect(rooms[0].connect).toHaveBeenCalledWith('wss://calls.test', 'tok');
  expect(rooms[0].startAudio).toHaveBeenCalled();
  // The message goes out in an effect, after the buttons show.
  await waitFor(() =>
    expect(sentOf('live')).toEqual([expect.objectContaining({ listening: true })])
  );
  // No microphone, camera or screen controls: it only listens.
  expect(screen.queryByRole('button', { name: /microphone|camera|share/i })).toBeNull();
});

it("mutes on its own button and on the game's message; says speaking; leaves", async () => {
  mockApi({ ...GUEST, ...answers('live') });
  renderView();
  await listen();
  speakerJoins(rooms[0]);
  const audio = () => document.querySelector('audio');
  expect(audio().muted).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Mute the call' }));
  expect(audio().muted).toBe(true);
  fromGame({ type: 'mute', muted: false });
  expect(audio().muted).toBe(false);
  // Someone on the stage talks: the game hears it, the button shows the ring.
  act(() => {
    rooms[0].activeSpeakers = [rooms[0].remoteParticipants.get('p-olga')];
    rooms[0].emit('activeSpeakersChanged');
  });
  await waitFor(() =>
    expect(sentOf('speaking')).toEqual([expect.objectContaining({ active: true })])
  );
  expect(
    screen
      .getByRole('button', { name: 'Mute the call' })
      .classList.contains('embed-call__button--talking')
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
  expect(await screen.findByText('You left the call.')).toBeTruthy();
  await waitFor(() => expect(sentOf('live').at(-1)).toMatchObject({ listening: false }));
});

it('collapses and expands, asking the game for the size', async () => {
  mockApi({ ...GUEST, ...answers('live') });
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Collapse' }));
  expect(sentOf('resize').at(-1)).toMatchObject({
    mode: 'collapsed',
    width: 48,
    height: window.innerHeight,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
  expect(sentOf('resize').at(-1)).toMatchObject({ mode: 'picture', height: window.innerHeight });
  // The game's collapse does the same, and asks nothing back.
  fromGame({ type: 'collapse', collapsed: true });
  expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
  expect(sentOf('resize')).toHaveLength(2);
});

it('out of sight: no picture, the sound plays on', async () => {
  mockApi({ ...GUEST, ...answers('live') });
  renderView();
  await listen();
  speakerJoins(rooms[0]);
  expect(screen.getByRole('region', { name: 'Stage' })).toBeTruthy();
  fromGame({ type: 'visible', visible: false });
  expect(screen.queryByRole('region', { name: 'Stage' })).toBeNull();
  expect(document.querySelector('audio')).not.toBeNull();
});

it('ignores messages from another origin, another window or another source', async () => {
  mockApi({ ...GUEST, ...answers('live') });
  renderView();
  await screen.findByRole('button', { name: 'Collapse' });
  fromGame({ type: 'collapse', collapsed: true }, { origin: 'https://evil.example' });
  fromGame({ type: 'collapse', collapsed: true }, { source: window });
  fromGame({ type: 'collapse', collapsed: true, source: 'seasonal-chat-host' });
  expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
});

it('the call ends: says ended and shows it', async () => {
  mockApi({ ...GUEST, ...answers('live') });
  renderView();
  await listen();
  act(() => rooms[0].emit('disconnected', 5)); // the fake's DisconnectReason.ROOM_DELETED
  expect(await screen.findByText('The call has ended.')).toBeTruthy();
  expect(sentOf('ended')).toEqual([expect.objectContaining({ reason: 'ended' })]);
});

it('a deleted call says ended with reason gone; a scheduled one is not started yet', async () => {
  mockApi({ ...GUEST, 'GET /calls/7': { status: 404, body: { ok: false, error: 'not_found' } } });
  renderView();
  expect(await screen.findByText('This call no longer exists.')).toBeTruthy();
  await waitFor(() =>
    expect(sentOf('ended')).toEqual([expect.objectContaining({ reason: 'gone' })])
  );
});

it('a scheduled call is not started yet and offers no Listen', async () => {
  mockApi({ ...GUEST, ...answers('scheduled') });
  renderView();
  expect(await screen.findByText('Not started yet')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
});

it('a recorded call asks first; "Not now" says error, the yes joins', async () => {
  const consent = (body) =>
    body?.recordingConsent
      ? JOINED
      : { status: 409, body: { ok: false, error: 'recording_consent', message: 'Recorded.' } };
  const calls = mockApi({ ...GUEST, ...answers('live', consent) });
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Listen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
  expect(sentOf('error')).toEqual([expect.objectContaining({ code: 'recording_consent' })]);
  expect(rooms).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'I understand this call is being recorded' })
  );
  await screen.findByRole('button', { name: 'Leave' });
  expect(calls.filter((c) => c.key === 'POST /calls/7/join').at(-1).body).toEqual({
    recordingConsent: true,
    listenOnly: true,
  });
});

it('a full call says error with its code', async () => {
  mockApi({
    ...GUEST,
    ...answers('live', {
      status: 403,
      body: { ok: false, error: 'call_full', message: 'This call is full.' },
    }),
  });
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Listen' }));
  expect(await screen.findByText('This call is full.')).toBeTruthy();
  // The message goes out in an effect after the text is shown: wait for it (CI, 2026-11-22).
  await waitFor(() =>
    expect(sentOf('error')).toEqual([expect.objectContaining({ code: 'call_full' })])
  );
});
