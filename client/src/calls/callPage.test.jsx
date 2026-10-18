// ============================================================
// File:        callPage.test.jsx
// Path:        client/src/calls/callPage.test.jsx
// Project:     Seasonal Entertainment
// Description: /calls/:id with a stand-in for livekit-client: nothing connects or plays until
//              "Join call" (browsers need the click for sound); then the token from the server
//              connects and audio starts; a speaker's screen share without sound shows the
//              notice and is reported to the server; the call ending for everyone shows so.
//              Guests get no hand; calls not live offer no Join.
// ============================================================

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';
import { NO_SHARE_AUDIO } from './stageModel.js';

// The stand-in Room: records what the page asks and lets a test send events.
const rooms = [];
vi.mock('livekit-client', () => {
  class Room {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.metadata = '';
      this.activeSpeakers = [];
      this.remoteParticipants = new Map();
      this.connect = vi.fn(async () => {});
      this.startAudio = vi.fn(async () => {});
      this.disconnect = vi.fn(async () => {});
      const room = this;
      this.localParticipant = {
        identity: 'p-me',
        name: 'me',
        attributes: { kind: 'member', hand: '0', handAt: '' },
        permissions: { canPublish: false },
        isScreenShareEnabled: false,
        getTrackPublication: () => undefined, // no sound with the share
        setScreenShareEnabled: vi.fn(async function (on) {
          this.isScreenShareEnabled = on;
          room.emit('localTrackPublished', { source: 'screen_share' });
        }),
      };
      rooms.push(this);
    }
    on(event, handler) {
      (this.handlers[event] ??= []).push(handler);
    }
    emit(event, ...args) {
      (this.handlers[event] ?? []).forEach((h) => h(...args));
    }
  }
  const RoomEvent = new Proxy(
    {},
    { get: (_t, name) => name.charAt(0).toLowerCase() + name.slice(1) }
  );
  return {
    Room,
    RoomEvent,
    DisconnectReason: { ROOM_DELETED: 5 },
    Track: {
      Source: {
        Camera: 'camera',
        Microphone: 'microphone',
        ScreenShare: 'screen_share',
        ScreenShareAudio: 'screen_share_audio',
      },
    },
  };
});

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
