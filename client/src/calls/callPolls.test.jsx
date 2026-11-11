// ============================================================
// File:        callPolls.test.jsx
// Path:        client/src/calls/callPolls.test.jsx
// Project:     Seasonal Entertainment
// Description: Polls in a call (CallPolls, the call page's header button, PollForm with a call,
//              Countdown; docs/POLLS.md, "Polls in a call"): the call's polls show under the
//              stage with a countdown, also before joining; no panel and no button while there
//              is no poll and the viewer is a member; an organiser's "Start a poll" opens the
//              form with 1, 2 or 5 minutes or by hand and sends the call with an end that many
//              minutes ahead.
// ============================================================

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
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

const CALL = {
  id: 7,
  title: 'Town hall',
  status: 'live',
  description: '',
  createdBy: 'olga',
  chatRoom: 'call-7',
  scheduledFor: null,
  startedAt: '2026-10-19T18:00:00Z',
  endedAt: null,
};
const POLL = {
  id: 3,
  question: 'Next topic?',
  kind: 'choice',
  multiple: false,
  otherText: false,
  anonymous: true,
  voters: 'members',
  steps: [],
  callId: 7,
  callTitle: 'Town hall',
  open: true,
  endsAt: new Date(Date.now() + 90_000).toISOString(),
  endedAt: null,
  createdBy: 'olga',
  votes: 0,
  voted: false,
  mayVote: true,
  canVote: true,
  myVote: null,
  results: null,
  options: [
    { id: 1, label: 'Prices' },
    { id: 2, label: 'Games' },
  ],
};
const page = (canManage, polls) => ({
  'GET /calls/7': { body: { ok: true, call: CALL, canManage } },
  'GET /chat/rooms?include=call-7': {
    body: {
      ok: true,
      rooms: [{ slug: 'call-7', name: 'Call: Town hall', canWrite: true }],
      me: {},
    },
  },
  'GET /chat/rooms/call-7/messages': { body: { ok: true, messages: [] } },
  'GET /polls?call=7': { body: { ok: true, canManage, canDelete: false, steps: [], polls } },
});

it("shows the call's polls with a countdown, also before joining", async () => {
  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...page(false, [POLL]) });
  await renderApp('/calls/7');
  const panel = await screen.findByRole('region', { name: 'Polls in this call' });
  expect(within(panel).getByRole('heading', { name: 'Next topic?' })).toBeInTheDocument();
  expect(within(panel).getByRole('timer')).toHaveTextContent(/^1:(2|3)\d left$/);
  expect(within(panel).getByRole('form', { name: 'Vote: Next topic?' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start a poll' })).toBeNull();
});

it('no panel without a poll; an organiser starts one for 2 minutes', async () => {
  const calls = mockApi({
    ...signedIn({ username: 'olga', role: 'organiser' }),
    ...page(true, []),
    'POST /polls': { status: 201, body: { ok: true } },
  });
  await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Start a poll' }));
  const form = await screen.findByRole('form', { name: 'New poll' });
  expect(within(form).getByRole('radio', { name: '1 minute' })).toBeChecked();
  expect(within(form).queryByRole('radio', { name: 'End at a fixed time' })).toBeNull();
  fireEvent.change(within(form).getByLabelText('Question'), { target: { value: 'Break?' } });
  fireEvent.change(within(form).getByLabelText('Answer 1'), { target: { value: 'Yes' } });
  fireEvent.change(within(form).getByLabelText('Answer 2'), { target: { value: 'No' } });
  fireEvent.click(within(form).getByRole('radio', { name: '2 minutes' }));
  const before = Date.now();
  fireEvent.click(within(form).getByRole('button', { name: 'Create poll' }));
  await waitFor(() => expect(calls.some((c) => c.key === 'POST /polls')).toBe(true));
  const sent = calls.find((c) => c.key === 'POST /polls').body;
  expect(sent.callId).toBe(7);
  const ahead = Date.parse(sent.endsAt) - before;
  expect(ahead).toBeGreaterThanOrEqual(120_000 - 1000);
  expect(ahead).toBeLessThan(120_000 + 5000);
});

it('a member sees no panel while the call has no poll', async () => {
  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...page(false, []) });
  await renderApp('/calls/7');
  await screen.findByRole('button', { name: 'Join call' });
  expect(screen.queryByRole('region', { name: 'Polls in this call' })).toBeNull();
});
