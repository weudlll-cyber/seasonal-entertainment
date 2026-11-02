// ============================================================
// File:        callPage.test.jsx
// Path:        client/src/calls/callPage.test.jsx
// Project:     Seasonal Entertainment
// Description: /calls/:id with a stand-in for livekit-client: nothing connects or plays until "Join
//              call" (browsers need the click for sound); then the token from the server connects
//              and audio starts; a speaker's screen share without sound shows the notice (in Chrome
//              and Edge how to share with sound, and "Share again with sound", which asks the
//              browser once more) and is reported to the server; the call ending for everyone shows
//              so. Guests get no hand; calls not live offer no Join. A load refused for the
//              moment (429) is asked again, so the Join button still comes; "no such call" is
//              not asked again.
// ============================================================

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { rooms } from '../test/fakeLiveKit.js';
import { renderApp } from '../test/renderApp.jsx';
import { RETRY_MS } from '../pages/CallPage.jsx';
import { NO_SHARE_AUDIO, NO_SOUND_SHARED } from './stageModel.js';

// The stand-in Room (test/fakeLiveKit.js): records what the page asks, lets a test send events.
vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));

beforeEach(() => {
  rooms.length = 0;
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const CALL = (status) => ({
  id: 7,
  title: 'Town hall',
  status,
  description: '',
  createdBy: 'olga',
  chatRoom: 'call-7',
  scheduledFor: null,
  startedAt: '2026-10-19T18:00:00Z',
  endedAt: null,
});
const answers = (status, kind = 'member') => ({
  'GET /calls/7': { body: { ok: true, call: CALL(status), canManage: false } },
  'POST /calls/7/join': {
    body: { ok: true, url: 'wss://calls.test', token: 'tok', identity: 'p-me', kind },
  },
  'POST /calls/7/spotlight/share': { body: { ok: true } },
  'GET /chat/rooms?include=call-7': {
    body: {
      ok: true,
      rooms: [{ slug: 'call-7', name: 'Call: Town hall', canWrite: true }],
      me: {},
    },
  },
});

it('connects only after "Join call", with the server token, and starts the sound', async () => {
  const calls = mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...answers('live') });
  await renderApp('/calls/7');
  const join = await screen.findByRole('button', { name: 'Join call' });
  expect(rooms).toHaveLength(0);
  fireEvent.click(join);
  expect(await screen.findByRole('button', { name: 'Raise hand' })).toBeInTheDocument();
  const [room] = rooms;
  expect(room.connect).toHaveBeenCalledWith('wss://calls.test', 'tok');
  expect(room.startAudio).toHaveBeenCalled();
  expect(room.options).toMatchObject({ adaptiveStream: true, dynacast: true });
  expect(calls.some((c) => c.key === 'POST /calls/7/join')).toBe(true);
  expect(screen.getByText('Nobody is on the stage yet.')).toBeInTheDocument();
  // The call's own chat, asked for by name (it is unlisted); the site's chat button is not here.
  expect(calls.some((c) => c.key === 'GET /chat/rooms?include=call-7')).toBe(true);
  expect(screen.queryByRole('button', { name: /^Chat(:|$)/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument();
});

it('a share without sound shows the notice and is reported to the server', async () => {
  const calls = mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...answers('live') });
  await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
  await screen.findByRole('button', { name: 'Raise hand' });
  // Invited to the stage: the server's permission arrives as an event.
  act(() => {
    rooms[0].localParticipant.permissions = { canPublish: true };
    rooms[0].emit('participantPermissionsChanged');
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Share screen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Share now' }));
  expect(await screen.findByText(NO_SHARE_AUDIO)).toBeInTheDocument();
  const report = calls.find((c) => c.key === 'POST /calls/7/spotlight/share');
  expect(report.body).toEqual({ sharing: true });
  expect(rooms[0].localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ audio: true, systemAudio: 'include' })
  );
});

it('in Chrome and Edge: how to share with sound, and sharing again', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
  );
  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...answers('live') });
  await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
  await screen.findByRole('button', { name: 'Raise hand' });
  act(() => {
    rooms[0].localParticipant.permissions = { canPublish: true };
    rooms[0].emit('participantPermissionsChanged');
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Share screen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Share now' }));
  expect(await screen.findByText(NO_SOUND_SHARED)).toBeInTheDocument();
  expect(screen.queryByText(NO_SHARE_AUDIO)).toBeNull();
  const share = rooms[0].localParticipant.setScreenShareEnabled;
  share.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Share again with sound' }));
  await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  expect(share.mock.calls.map(([on]) => on)).toEqual([false, true]);
  vi.restoreAllMocks();
});

it('shows when the call has ended for everyone', async () => {
  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...answers('live') });
  await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
  await screen.findByRole('button', { name: 'Raise hand' });
  act(() => rooms[0].emit('disconnected', 5));
  expect(await screen.findByText('The call has ended.')).toBeInTheDocument();
});

it('guests get no hand; calls that are not live offer no Join', async () => {
  mockApi({ ...GUEST, ...answers('live', 'guest') });
  const page = await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
  expect(await screen.findByRole('button', { name: 'Leave call' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
  page.unmount();

  mockApi({ ...GUEST, ...answers('scheduled') });
  await renderApp('/calls/7');
  expect(await screen.findByText('This call has not started yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Join call' })).toBeNull();
});

it('a call linked to a bot event names the event; one without names none', async () => {
  const linked = { ...answers('scheduled') };
  linked['GET /calls/7'] = {
    body: { ok: true, call: { ...CALL('scheduled'), event: { name: 'Bot Quiz Night' } } },
  };
  mockApi({ ...GUEST, ...linked });
  const view = await renderApp('/calls/7');
  expect(await screen.findByText(/Event: Bot Quiz Night/)).toBeInTheDocument();
  view.unmount();
  mockApi({ ...GUEST, ...answers('scheduled') });
  await renderApp('/calls/7');
  await screen.findByText(/This call has not started yet/);
  expect(screen.queryByText(/Event:/)).toBeNull();
});

it('a load refused for the moment is asked again, and Join comes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  try {
    let refusals = 1;
    const live = answers('live');
    const calls = mockApi({
      ...signedIn({ username: 'mia', role: 'member' }),
      ...live,
      // The server's read limit for one address (server/src/app.js), once.
      'GET /calls/7': () =>
        refusals-- > 0
          ? {
              status: 429,
              body: {
                ok: false,
                error: 'too_many_attempts',
                message: 'Too many attempts. Please try again later.',
              },
            }
          : live['GET /calls/7'],
    });
    await renderApp('/calls/7');
    expect(
      await screen.findByText('Too many attempts. Please try again later.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join call' })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(RETRY_MS));
    expect(await screen.findByRole('button', { name: 'Join call' })).toBeInTheDocument();
    expect(screen.queryByText('Too many attempts. Please try again later.')).toBeNull();
    expect(calls.filter((c) => c.key === 'GET /calls/7')).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

it('"no such call" is not asked again', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  try {
    const calls = mockApi({
      ...signedIn({ username: 'mia', role: 'member' }),
      'GET /calls/7': {
        status: 404,
        body: { ok: false, error: 'not_found', message: 'No such call.' },
      },
    });
    await renderApp('/calls/7');
    expect(await screen.findByText('No such call.')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3 * RETRY_MS));
    expect(calls.filter((c) => c.key === 'GET /calls/7')).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
