// ============================================================
// File:        embedSharedCall.test.jsx
// Path:        client/src/embed/embedSharedCall.test.jsx
// Project:     Seasonal Entertainment
// Description: The view of the call shared with the games (/embed/call/shared,
//              EmbedSharedCallPage.jsx; docs/GAME-INTEGRATION.md section 9) with stand-ins for
//              livekit-client and the framing game: nothing shared posts no ready; sharing posts
//              ready with the call's id; the end, an unshare and a replacement post ended with
//              their reason, once, and the view keeps watching; ready names a newly shared call;
//              a sign-out posts ready again; a view leaving a speaking call says so; outside a
//              game nothing is asked. A member in the call elsewhere sees the note, and the
//              view joins after the leave (by its poll, or at once on the call page's word);
//              held-back sound is offered on Listen.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { fakeTrack } from '../calls/testRoom.js';
import { rooms } from '../test/fakeLiveKit.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { POLL_MS } from './EmbedCallPage.jsx';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));
const framing = vi.hoisted(() => ({ game: 'bingo' }));
vi.mock('./callView.js', async (actual) => ({
  ...(await actual()),
  framingGame: () => framing.game,
  onPhone: () => false,
}));

let host;
// What the site answers now: the shared call's id (or null) and each call's status.
let site;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  rooms.length = 0;
  framing.game = 'bingo';
  site = { shared: null, status: { 7: 'live', 8: 'live' } };
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
  vi.useRealTimers();
});

const callAnswer = (id) => () => ({
  body: {
    ok: true,
    call: { id, title: `Call ${id}`, status: site.status[id], recording: false },
  },
});
function view(session = GUEST) {
  site.session = session['GET /auth/session'];
  const calls = mockApi({
    ...session,
    'GET /auth/session': () => site.session,
    'GET /public/shared-call': () => ({
      body: { v: 1, call: site.shared && { id: site.shared, title: `Call ${site.shared}` } },
    }),
    'GET /calls/7': callAnswer(7),
    'GET /calls/8': callAnswer(8),
    'POST /calls/7/join': () => {
      if (site.broken) return { status: 503, body: {} };
      if (site.elsewhere) {
        return {
          status: 409,
          body: { ok: false, error: 'in_call_elsewhere', message: 'You are in this call.' },
        };
      }
      return { body: { ok: true, url: 'wss://calls.test', token: 'tok', identity: 'p-me' } };
    },
  });
  render(
    <MemoryRouter initialEntries={['/embed/call/shared?theme=dark']}>
      <App />
    </MemoryRouter>
  );
  return calls;
}
const sent = () => host.postMessage.mock.calls.map(([message]) => message);
// The messages about the call, without the fields every message has.
const heard = (...types) =>
  sent()
    .filter((m) => types.includes(m.type))
    .map(({ source: _source, origin: _origin, ...rest }) => rest);
// Lets `n` polls pass.
const polls = async (n = 1) => {
  for (let i = 0; i < n; i += 1) await act(() => vi.advanceTimersByTimeAsync(POLL_MS + 100));
};
const ready = (call, status = 'live', signed = false) => ({
  type: 'ready',
  call,
  status,
  signedIn: signed,
});

it('nothing shared: no ready, and a line saying so; sharing posts ready with the id', async () => {
  view();
  expect(await screen.findByText('No call is shared right now.')).toBeTruthy();
  await polls(2);
  expect(sent()).toEqual([]);
  site.shared = 7;
  await polls();
  expect(heard('ready', 'ended')).toEqual([ready(7)]);
  expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();
});

it('unshared posts ended unshared and keeps watching; the next one is named by ready', async () => {
  site.shared = 7;
  view();
  await polls();
  site.shared = null;
  await polls(3);
  expect(heard('ready', 'ended')).toEqual([ready(7), { type: 'ended', reason: 'unshared' }]);
  expect(screen.getByText('No call is shared right now.')).toBeTruthy();
  site.shared = 8;
  await polls(2);
  expect(heard('ready', 'ended').at(-1)).toEqual(ready(8));
  // The same call shared anew is news again.
  site.shared = null;
  await polls(2);
  site.shared = 8;
  await polls(2);
  expect(heard('ready', 'ended').slice(-2)).toEqual([
    { type: 'ended', reason: 'unshared' },
    ready(8),
  ]);
});

it('replaced while listening: leaves the old call, says unshared, then names the new one', async () => {
  site.shared = 7;
  view();
  await polls();
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByRole('button', { name: 'Leave' });
  // Someone on the stage is talking when the view moves on.
  const olga = {
    identity: 'p-olga',
    name: 'olga',
    attributes: { kind: 'host' },
    permissions: { canPublish: true },
    audioTrackPublications: new Map([['TR1', { trackSid: 'TR1', track: fakeTrack() }]]),
    getTrackPublication: () => undefined,
  };
  await act(async () => {
    rooms[0].remoteParticipants.set(olga.identity, olga);
    rooms[0].activeSpeakers = [olga];
    rooms[0].emit('activeSpeakersChanged');
  });
  site.shared = 8;
  await polls();
  expect(rooms[0].disconnect).toHaveBeenCalled();
  expect(heard('speaking').at(-1)).toEqual({ type: 'speaking', active: false });
  expect(heard('ready', 'ended')).toEqual([
    ready(7),
    { type: 'ended', reason: 'unshared' },
    ready(8),
  ]);
});

it('the shared call ends: ended once, and the view watches for the next', async () => {
  site.shared = 7;
  view();
  await polls();
  // The site clears the flag as the call ends; the view may notice either first.
  site.status[7] = 'ended';
  site.shared = null;
  await polls(3);
  expect(heard('ended')).toEqual([{ type: 'ended', reason: 'ended' }]);
  site.shared = 8;
  await polls();
  expect(heard('ready').at(-1)).toEqual(ready(8));
});

it('the end heard from the call room is not said again when the flag goes', async () => {
  site.shared = 7;
  view();
  await polls();
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByRole('button', { name: 'Leave' });
  await act(async () => rooms[0].emit('disconnected', 5)); // DisconnectReason.ROOM_DELETED
  expect(await screen.findByText('The call has ended.')).toBeTruthy();
  site.status[7] = 'ended';
  site.shared = null;
  await polls(2);
  expect(heard('ended')).toEqual([{ type: 'ended', reason: 'ended' }]);
});

it('a status change and a sign-out post ready again, for the same call', async () => {
  site.shared = 7;
  site.status[7] = 'scheduled';
  view(signedIn({ username: 'mia' }));
  await polls();
  site.status[7] = 'live';
  await polls();
  expect(heard('ready')).toEqual([ready(7, 'scheduled', true), ready(7, 'live', true)]);
  // Back to the tab after signing out elsewhere (session/returnCheck.js).
  site.session = GUEST['GET /auth/session'];
  await polls(2);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await polls();
  expect(heard('ready').at(-1)).toEqual(ready(7, 'live', false));
});

it('outside a game: the way to the calls only, and nothing asked', async () => {
  framing.game = null;
  site.shared = 7;
  const calls = view();
  const link = await screen.findByRole('link', { name: 'Open the call page' });
  expect(link.getAttribute('href')).toBe('/calls');
  await polls(2);
  expect(calls.some((c) => c.key.includes('shared-call'))).toBe(false);
  expect(sent()).toEqual([]);
});

// The member is in the call elsewhere until site.elsewhere is false.
async function waiting() {
  site.shared = 7;
  site.elsewhere = true;
  const calls = view(signedIn({ username: 'mia' }));
  await polls();
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByText(NOTE);
  return calls;
}
const NOTE = "You're in this call in another tab or on another device. The call plays there.";
const joins = (calls) => calls.filter((c) => c.key === 'POST /calls/7/join');

it('in the call elsewhere: a note with the title, no picture, and it asks again', async () => {
  const calls = await waiting();
  expect(joins(calls)[0].body).toEqual({ listenOnly: true, shared: true });
  expect(screen.getByText('Call 7')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Stage' })).toBeNull();
  const before = joins(calls).length;
  await polls(2);
  expect(joins(calls).length).toBeGreaterThanOrEqual(before + 2);
  // The note stays while it asks; the game hears no error; nothing was connected.
  expect(screen.getByText(NOTE)).toBeTruthy();
  expect(heard('error')).toEqual([]);
  expect(rooms).toHaveLength(0);
  // A server that does not answer changes nothing.
  site.broken = true;
  await polls();
  expect(screen.getByText(NOTE)).toBeTruthy();
  site.broken = false;
  // Left on the other device: the next question joins, and the sound starts.
  site.elsewhere = false;
  await polls();
  await screen.findByRole('button', { name: 'Leave' });
  expect(rooms).toHaveLength(1);
  expect(rooms[0].startAudio).toHaveBeenCalled();
  expect(heard('live').at(-1)).toEqual({ type: 'live', listening: true });
});

it("the call page's word in this browser: asks at once, for its own call only", async () => {
  const calls = await waiting();
  const say = async (call) => {
    const channel = new BroadcastChannel('seasonal-call-left');
    channel.postMessage({ call });
    channel.close();
    // Delivery takes a real turn of the event loop; far less than a poll.
    await act(() => vi.advanceTimersByTimeAsync(100));
  };
  const before = joins(calls).length;
  await say(8);
  expect(joins(calls)).toHaveLength(before);
  site.elsewhere = false;
  await say(7);
  // At once: no poll was due yet.
  expect(joins(calls)).toHaveLength(before + 1);
  await screen.findByRole('button', { name: 'Leave' });
});

it('stops asking when the call ends while waiting', async () => {
  const calls = await waiting();
  // Ended, with the public read still naming it (a cache holds it for a few seconds).
  site.status[7] = 'ended';
  await polls(2);
  const asked = joins(calls).length;
  await polls(2);
  expect(joins(calls)).toHaveLength(asked);
  expect(heard('ended')).toEqual([{ type: 'ended', reason: 'ended' }]);
});

it('sound the browser holds back: Listen once more, which starts it', async () => {
  site.shared = 7;
  view();
  await polls();
  const { Room } = await import('../test/fakeLiveKit.js');
  vi.spyOn(Room.prototype, 'on').mockImplementationOnce(function (event, handler) {
    // The first handler is registered before the connection: the room starts blocked.
    this.canPlaybackAudio = false;
    (this.handlers[event] ??= []).push(handler);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByRole('button', { name: 'Leave' });
  expect(screen.queryByRole('button', { name: 'Mute the call' })).toBeNull();
  rooms[0].startAudio.mockImplementation(async () => {
    rooms[0].canPlaybackAudio = true;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByRole('button', { name: 'Mute the call' });
  expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
});

it('the call page joining takes over: the note, and the sound again after the leave', async () => {
  site.shared = 7;
  const calls = view(signedIn({ username: 'mia' }));
  await polls();
  fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
  await screen.findByRole('button', { name: 'Leave' });
  // The member joins on the call page: the call service drops this view's connection.
  site.elsewhere = true;
  await act(async () => rooms[0].emit('disconnected', 2)); // DisconnectReason.DUPLICATE_IDENTITY
  expect(screen.getByText(NOTE)).toBeTruthy();
  const before = joins(calls).length;
  await polls();
  expect(joins(calls).length).toBeGreaterThan(before);
  expect(rooms).toHaveLength(1);
  site.elsewhere = false;
  await polls();
  await screen.findByRole('button', { name: 'Leave' });
  expect(rooms).toHaveLength(2);
});
