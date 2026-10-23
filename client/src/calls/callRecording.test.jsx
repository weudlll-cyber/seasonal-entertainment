// ============================================================
// File:        callRecording.test.jsx
// Path:        client/src/calls/callRecording.test.jsx
// Project:     Seasonal Entertainment
// Description: Call recording in the browser (useCallRoom, CallPage, RecordingConsent,
//              CallRecordings; docs/CALLS.md, "Recording"): joining a recorded call asks first,
//              and without "I understand this call is being recorded" nothing connects; a start
//              during the call shows the red "Recording" and the banner; someone who joined
//              before it started is asked before their microphone goes on; organisers get
//              Start / Stop recording only when it is set up; recordings are listed with their
//              length (none while it is unknown) and a player, organisers delete them; the
//              Calls page says "Being recorded".
// ============================================================

import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatWhen } from '../app/dates.js';
import { rooms } from '../test/fakeLiveKit.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));

beforeEach(() => {
  rooms.length = 0;
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const CALL = (extra) => ({
  id: 7,
  title: 'Town hall',
  status: 'live',
  description: '',
  createdBy: 'olga',
  chatRoom: 'call-7',
  scheduledFor: null,
  startedAt: '2026-10-22T18:00:00Z',
  endedAt: null,
  recording: false,
  ...extra,
});

// The call's answers; recording: whether one runs; manage: an organiser with recording set up.
function answers({ recording = false, manage = false, recordings = [] } = {}) {
  return {
    'GET /calls/7': {
      body: {
        ok: true,
        call: CALL({ recording }),
        canManage: manage,
        recordingEnabled: manage,
      },
    },
    'POST /calls/7/join': (sent) =>
      recording && !sent?.recordingConsent
        ? { status: 409, body: { ok: false, error: 'recording_consent', message: 'recorded' } }
        : {
            body: {
              ok: true,
              url: 'wss://calls.test',
              token: 'tok',
              identity: 'p-me',
              kind: 'member',
            },
          },
    'GET /calls/7/recordings': { body: { ok: true, recordings } },
    'POST /calls/7/recording/start': { body: { ok: true } },
    'DELETE /calls/7/recordings/3': { body: { ok: true } },
    'GET /chat/rooms?include=call-7': {
      body: {
        ok: true,
        rooms: [{ slug: 'call-7', name: 'Call: Town hall', canWrite: true }],
        me: {},
      },
    },
  };
}
const mia = signedIn({ username: 'mia', role: 'member' });
const joinCalls = (calls) => calls.filter((c) => c.key === 'POST /calls/7/join');

describe('joining a recorded call', () => {
  it('asks first; "Not now" connects nothing; "I understand" joins', async () => {
    const calls = mockApi({ ...mia, ...answers({ recording: true }) });
    await renderApp('/calls/7');
    expect(await screen.findByText(/Being recorded/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
    const dialog = await screen.findByRole('dialog', { name: 'This call is being recorded' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(rooms).toHaveLength(0);
    expect(joinCalls(calls).map((c) => c.body)).toEqual([undefined]);
    fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'I understand this call is being recorded',
      })
    );
    await vi.waitFor(() => expect(rooms[0]?.connect).toHaveBeenCalled());
    expect(joinCalls(calls).at(-1).body).toEqual({ recordingConsent: true });
  });
});

describe('a recording that starts during the call', () => {
  async function joined() {
    const calls = mockApi({ ...mia, ...answers() });
    await renderApp('/calls/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
    await vi.waitFor(() => expect(rooms[0]?.connect).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Leave call' });
    const room = rooms[0];
    act(() => {
      room.metadata = JSON.stringify({ spotlight: null, recording: true });
      room.emit('roomMetadataChanged');
    });
    return { calls, room };
  }

  it('shows the red "Recording" and the banner', async () => {
    await joined();
    expect(await screen.findByText('This call is now being recorded')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recording');
  });

  it('someone who joined before it started is asked before the microphone goes on', async () => {
    const { room } = await joined();
    act(() => {
      room.localParticipant.permissions = { canPublish: true };
      room.emit('participantPermissionsChanged');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Unmute microphone' }));
    const dialog = await screen.findByRole('dialog', { name: 'This call is being recorded' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'I understand this call is being recorded',
      })
    );
    await vi.waitFor(() =>
      expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    );
  });
});

describe('organisers and the recordings', () => {
  it('Start recording only when it is set up', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...answers({ manage: true }),
    });
    await renderApp('/calls/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /calls/7/recording/start')).toBe(true)
    );
  });

  it('no button without recording set up', async () => {
    mockApi({ ...signedIn({ username: 'olga', role: 'organiser' }), ...answers() });
    await renderApp('/calls/7');
    await screen.findByRole('button', { name: 'Join call' });
    expect(screen.queryByRole('button', { name: /recording/ })).toBeNull();
  });

  it('recordings with their length and a player; organisers delete one', async () => {
    const recordings = [
      { id: 3, startedAt: '2026-10-22T18:00:00Z', seconds: 3725, chapters: [] },
      { id: 4, startedAt: '2026-10-22T19:00:00Z', seconds: null, chapters: [] }, // length not known
    ];
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...answers({ manage: true, recordings }),
    });
    await renderApp('/calls/7');
    const list = await screen.findByRole('region', { name: 'Recordings' });
    expect(list).toHaveTextContent('1:02:05');
    const [, unknown] = within(list).getAllByRole('listitem');
    // Only the date (in the device's zone, as the page writes it): no length.
    expect(unknown.querySelector('p').textContent).toBe(formatWhen('2026-10-22T19:00:00Z'));
    expect(list.querySelector('video')).toHaveAttribute('src', '/api/calls/7/recordings/3/video');
    fireEvent.click(within(list).getAllByRole('button', { name: 'Delete recording' })[0]);
    fireEvent.click(within(list).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /calls/7/recordings/3')).toBe(true)
    );
  });
});

it('the Calls page says "Being recorded"', async () => {
  mockApi({
    ...mia,
    'GET /calls/summary': { body: { ok: true, configured: true, live: true } },
    'GET /calls': {
      body: {
        ok: true,
        configured: true,
        canManage: false,
        calls: { live: [CALL({ recording: true })], upcoming: [], recent: [] },
        reminders: [],
      },
    },
  });
  await renderApp('/calls');
  const live = await screen.findByRole('region', { name: 'Live now' });
  expect(await within(live).findByText('Being recorded')).toBeInTheDocument();
});
