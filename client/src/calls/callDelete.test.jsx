// ============================================================
// File:        callDelete.test.jsx
// Path:        client/src/calls/callDelete.test.jsx
// Project:     Seasonal Entertainment
// Description: "Delete call" (calls/deleteCall.js, docs/CALLS.md "Deleting a call"): on the
//              calls list and the call's page only for admins (the server's canDelete) and only
//              on an ended call; it asks first, naming the call and that its chat and
//              recordings go too; declined, nothing is sent; confirmed, DELETE /api/calls/:id
//              and the list reloads (from the call's page: back to the list).
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';
import { deleteCallQuestion } from './deleteCall.js';

const CALL = (id, title, status) => ({
  id,
  title,
  status,
  description: '',
  createdBy: 'olga',
  chatRoom: `call-${id}`,
  scheduledFor: null,
  startedAt: status === 'scheduled' ? null : '2026-11-04T18:00:00Z',
  endedAt: status === 'ended' ? '2026-11-04T19:00:00Z' : null,
});
const LISTS = {
  live: [CALL(1, 'Town hall', 'live')],
  upcoming: [CALL(2, 'Race night', 'scheduled')],
  recent: [CALL(3, 'Test call', 'ended')],
};
const ADA = signedIn({ username: 'ada', role: 'admin' });
const OLGA = signedIn({ username: 'olga', role: 'organiser' });
const listAnswers = (who, canDelete) => ({
  ...who,
  'GET /calls/summary': { body: { ok: true, configured: true, live: true } },
  'GET /calls': {
    body: { ok: true, configured: true, canManage: true, canDelete, calls: LISTS, reminders: [] },
  },
  'GET /calls/bot-occurrences': { body: { ok: true, occurrences: [] } },
  'DELETE /calls/3': { body: { ok: true } },
});

let confirmed; // the questions asked
let answer; // what the admin answers
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  confirmed = [];
  answer = true;
  vi.stubGlobal('confirm', (question) => {
    confirmed.push(question);
    return answer;
  });
});
afterEach(() => vi.unstubAllGlobals());

const section = (name) => screen.findByRole('region', { name });

it('admins alone see "Delete" on calls list, and only on an ended call', async () => {
  mockApi(listAnswers(OLGA, false));
  const { unmount } = await renderApp('/calls');
  await within(await section('Recent')).findByText('Test call');
  expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  unmount();

  mockApi(listAnswers(ADA, true));
  await renderApp('/calls');
  const recent = await section('Recent');
  expect(await within(recent).findByRole('button', { name: 'Delete Test call' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(1);
});

it('asks first, naming the call, its chat and recordings; declined, nothing is sent', async () => {
  const calls = mockApi(listAnswers(ADA, true));
  await renderApp('/calls');
  const button = await within(await section('Recent')).findByRole('button', {
    name: 'Delete Test call',
  });
  answer = false;
  fireEvent.click(button);
  expect(confirmed).toEqual([deleteCallQuestion(LISTS.recent[0])]);
  expect(confirmed[0]).toContain('"Test call"');
  expect(confirmed[0]).toContain('Its chat and its recordings are deleted too');
  expect(calls.some((c) => c.key === 'DELETE /calls/3')).toBe(false);

  answer = true;
  const lists = () => calls.filter((c) => c.key === 'GET /calls').length;
  const before = lists();
  fireEvent.click(button);
  await vi.waitFor(() => expect(calls.some((c) => c.key === 'DELETE /calls/3')).toBe(true));
  await vi.waitFor(() => expect(lists()).toBeGreaterThan(before));
});

it("the call's page: Delete for admins on an ended call, then back to the list", async () => {
  const page = (status, canDelete, who) => ({
    ...who,
    ...listAnswers(who, canDelete),
    'GET /calls/3': {
      body: {
        ok: true,
        call: { ...CALL(3, 'Test call', status), event: null, recording: false },
        canManage: true,
        canDelete,
        recordingEnabled: false,
      },
    },
    'GET /calls/3/recordings': { body: { ok: true, recordings: [] } },
    'GET /chat/rooms?include=call-3': {
      body: {
        ok: true,
        rooms: [{ slug: 'call-3', name: 'Call: Test call', canWrite: false }],
        me: {},
      },
    },
    'GET /chat/rooms/call-3/messages': { body: { ok: true, messages: [] } },
  });
  // An organiser, or a call not ended: no button.
  mockApi(page('ended', false, OLGA));
  const first = await renderApp('/calls/3');
  await screen.findByText('This call has ended.');
  expect(screen.queryByRole('button', { name: 'Delete call' })).toBeNull();
  first.unmount();
  mockApi(page('live', true, ADA));
  const second = await renderApp('/calls/3');
  await screen.findByRole('heading', { level: 1, name: /Test call/ });
  expect(screen.queryByRole('button', { name: 'Delete call' })).toBeNull();
  second.unmount();

  const calls = mockApi(page('ended', true, ADA));
  await renderApp('/calls/3');
  fireEvent.click(await screen.findByRole('button', { name: 'Delete call' }));
  expect(confirmed).toEqual([deleteCallQuestion(LISTS.recent[0])]);
  await vi.waitFor(() => expect(calls.some((c) => c.key === 'DELETE /calls/3')).toBe(true));
  expect(await screen.findByRole('heading', { level: 1, name: 'Calls' })).toBeInTheDocument();
});
