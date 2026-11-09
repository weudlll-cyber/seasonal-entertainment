// ============================================================
// File:        quickStart.test.jsx
// Path:        client/src/calls/quickStart.test.jsx
// Project:     Seasonal Entertainment
// Description: Starting a call in one go (docs/CALLS.md, "Starting a call"; decided 2026-11-06):
//              the form's button reads "Start call now" without a planned start and "Create call"
//              with one, switching as the field changes; "Start call now" creates, starts, opens
//              the call's page and joins it; "Start <title>" on a card opens and joins too; the
//              join happens once (calls/callIntent.js), never on a reload; a start that fails
//              after the create shows the planned call with the error; a join that fails leaves
//              the Join button and its error. "Record from the start" shows only while recording is
//              allowed, starts off and goes with the new call. Joined after a start, the
//              microphone goes on (the camera stays off); an ordinary join or a reload turns
//              nothing on; a refused microphone leaves the call joined with the error. With a
//              stand-in for livekit-client.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { rooms } from '../test/fakeLiveKit.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));

beforeEach(() => {
  rooms.length = 0;
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const CALL = (id, title, status) => ({
  id,
  title,
  status,
  description: '',
  createdBy: 'olga',
  chatRoom: `call-${id}`,
  scheduledFor: null,
  startedAt: status === 'live' ? '2026-11-07T18:00:00Z' : null,
  endedAt: null,
});
const LIST = {
  'GET /calls/summary': { body: { ok: true, configured: true, live: false } },
  'GET /calls': {
    body: {
      ok: true,
      configured: true,
      canManage: true,
      calls: { live: [], upcoming: [CALL(2, 'Race night', 'scheduled')], recent: [] },
    },
  },
  'GET /calls/bot-occurrences': { body: { ok: true, occurrences: [] } },
};
// Call `id` as its page loads it, live or still planned, and its join.
const page = (
  id,
  status,
  join = { body: { ok: true, url: 'wss://calls.test', token: 'tok' } }
) => ({
  [`GET /calls/${id}`]: {
    body: { ok: true, call: CALL(id, 'Q&A', status), canManage: true, recordingEnabled: false },
  },
  [`POST /calls/${id}/join`]: join,
  [`GET /chat/rooms?include=call-${id}`]: {
    body: { ok: true, rooms: [{ slug: `call-${id}`, name: 'Call: Q&A', canWrite: true }], me: {} },
  },
  [`GET /chat/rooms/call-${id}/messages`]: { body: { ok: true, messages: [] } },
});
const ORGANISER = signedIn({ username: 'olga', role: 'organiser' });
// Where the router is now and the state it carries, as text.
function Where() {
  const { pathname, state } = useLocation();
  return <output aria-label="Location">{`${pathname} ${JSON.stringify(state)}`}</output>;
}
const joins = (calls, id) => calls.filter((c) => c.key === `POST /calls/${id}/join`).length;

it('the button reads "Start call now" without a planned start, "Create call" with one', async () => {
  mockApi({ ...ORGANISER, ...LIST });
  await renderApp('/calls');
  const form = await screen.findByRole('form', { name: 'New call' });
  const when = within(form).getByLabelText('Planned start (optional)');
  expect(within(form).getByRole('button', { name: 'Start call now' })).toBeInTheDocument();
  fireEvent.change(when, { target: { value: '2026-11-20T19:30' } });
  expect(within(form).getByRole('button', { name: 'Create call' })).toBeInTheDocument();
  fireEvent.change(when, { target: { value: '' } });
  expect(within(form).getByRole('button', { name: 'Start call now' })).toBeInTheDocument();
});

it('"Start call now": create, start, the call page, joined', async () => {
  const calls = mockApi({
    ...ORGANISER,
    ...LIST,
    'POST /calls': { status: 201, body: { ok: true, call: CALL(7, 'Q&A', 'scheduled') } },
    'POST /calls/7/start': { body: { ok: true, call: CALL(7, 'Q&A', 'live') } },
    ...page(7, 'live'),
  });
  await renderApp('/calls');
  const form = await screen.findByRole('form', { name: 'New call' });
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Q&A' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Start call now' }));
  expect(await screen.findByRole('button', { name: 'Raise hand' })).toBeInTheDocument();
  expect(calls.map((c) => c.key)).toEqual(
    expect.arrayContaining(['POST /calls', 'POST /calls/7/start', 'POST /calls/7/join'])
  );
  expect(calls.find((c) => c.key === 'POST /calls').body.scheduledFor).toBeNull();
  expect(joins(calls, 7)).toBe(1);
  expect(rooms[0].connect).toHaveBeenCalledWith('wss://calls.test', 'tok');
});

it('"Start <title>" on a card opens the call and joins it', async () => {
  const calls = mockApi({
    ...ORGANISER,
    ...LIST,
    'POST /calls/2/start': { body: { ok: true, call: CALL(2, 'Race night', 'live') } },
    ...page(2, 'live'),
  });
  await renderApp('/calls');
  fireEvent.click(await screen.findByRole('button', { name: 'Start Race night' }));
  expect(await screen.findByRole('button', { name: 'Raise hand' })).toBeInTheDocument();
  expect(joins(calls, 2)).toBe(1);
});

it('joins once; the intent is gone after arrival, so a reload does not join', async () => {
  const calls = mockApi({ ...ORGANISER, ...LIST, ...page(7, 'live') });
  const { unmount } = render(
    <MemoryRouter initialEntries={[{ pathname: '/calls/7', state: { join: true } }]}>
      <App />
      <Where />
    </MemoryRouter>
  );
  expect(await screen.findByRole('button', { name: 'Raise hand' })).toBeInTheDocument();
  expect(joins(calls, 7)).toBe(1);
  expect(screen.getByRole('status', { name: 'Location' })).toHaveTextContent('/calls/7 null');
  unmount();
  // A reload: the same address with what the history kept, which is nothing now.
  await renderApp({ pathname: '/calls/7', state: null });
  expect(await screen.findByRole('button', { name: 'Join call' })).toBeInTheDocument();
  expect(joins(calls, 7)).toBe(1);
});

it('a start that fails after the create: the planned call with the error, no join', async () => {
  const calls = mockApi({
    ...ORGANISER,
    ...LIST,
    'POST /calls': { status: 201, body: { ok: true, call: CALL(7, 'Q&A', 'scheduled') } },
    'POST /calls/7/start': {
      status: 503,
      body: { ok: false, error: 'calls_unavailable', message: 'The call service did not answer.' },
    },
    ...page(7, 'scheduled'),
  });
  await renderApp('/calls');
  const form = await screen.findByRole('form', { name: 'New call' });
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Q&A' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Start call now' }));
  expect(await screen.findByText('The call service did not answer.')).toBeInTheDocument();
  expect(screen.getByText('This call has not started yet.')).toBeInTheDocument();
  expect(joins(calls, 7)).toBe(0);
});

it('a join that fails leaves the Join button and its error', async () => {
  const refused = { status: 403, body: { ok: false, error: 'forbidden', message: 'No joining.' } };
  mockApi({ ...ORGANISER, ...LIST, ...page(7, 'live', refused) });
  await renderApp({ pathname: '/calls/7', state: { join: true } });
  expect(await screen.findByText('No joining.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Join call' })).toBeInTheDocument();
});

it('"Record from the start": only while recording is allowed, off by default, sent with the call', async () => {
  const listWith = (recordingEnabled) => ({
    ...LIST,
    'GET /calls': { body: { ...LIST['GET /calls'].body, recordingEnabled } },
  });
  mockApi({ ...ORGANISER, ...listWith(false) });
  const { unmount } = await renderApp('/calls');
  await screen.findByRole('form', { name: 'New call' });
  expect(screen.queryByLabelText('Record from the start')).toBeNull();
  unmount();

  const calls = mockApi({
    ...ORGANISER,
    ...listWith(true),
    'POST /calls': { status: 201, body: { ok: true, call: CALL(7, 'Q&A', 'scheduled') } },
  });
  await renderApp('/calls');
  const form = await screen.findByRole('form', { name: 'New call' });
  const box = within(form).getByLabelText('Record from the start');
  expect(box).not.toBeChecked();
  fireEvent.click(box);
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Q&A' } });
  fireEvent.change(within(form).getByLabelText('Planned start (optional)'), {
    target: { value: '2026-11-20T19:30' },
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Create call' }));
  await vi.waitFor(() =>
    expect(calls.find((c) => c.key === 'POST /calls')?.body.recordFromStart).toBe(true)
  );
});

describe('the microphone after a start', () => {
  // The room's stand-in puts its member on the stage, as LiveKit does after the join.
  const onStage = () =>
    act(() => {
      rooms[0].localParticipant.permissions = { canPublish: true };
      rooms[0].emit('participantPermissionsChanged');
    });
  const local = () => rooms[0].localParticipant;

  it('joined after starting: the microphone goes on, the camera stays off', async () => {
    mockApi({ ...ORGANISER, ...LIST, ...page(7, 'live') });
    await renderApp({ pathname: '/calls/7', state: { join: true } });
    await vi.waitFor(() => expect(rooms[0]?.connect).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Leave call' });
    onStage();
    await vi.waitFor(() => expect(local().setMicrophoneEnabled).toHaveBeenCalledWith(true));
    expect(local().setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(local().setCameraEnabled).not.toHaveBeenCalled();
  });

  it('an ordinary join, also after a reload, turns nothing on', async () => {
    mockApi({ ...ORGANISER, ...LIST, ...page(7, 'live') });
    await renderApp({ pathname: '/calls/7', state: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
    await screen.findByRole('button', { name: 'Leave call' });
    onStage();
    // Give an effect the chance it must not take.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(local().setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(local().setCameraEnabled).not.toHaveBeenCalled();
  });

  it('a microphone the browser refuses: the call stays joined, the error shows', async () => {
    mockApi({ ...ORGANISER, ...LIST, ...page(7, 'live') });
    await renderApp({ pathname: '/calls/7', state: { join: true } });
    await screen.findByRole('button', { name: 'Leave call' });
    local().setMicrophoneEnabled.mockRejectedValueOnce(new Error('Permission denied'));
    onStage();
    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave call' })).toBeInTheDocument();
  });
});
