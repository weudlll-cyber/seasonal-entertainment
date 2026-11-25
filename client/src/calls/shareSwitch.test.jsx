// ============================================================
// File:        shareSwitch.test.jsx
// Path:        client/src/calls/shareSwitch.test.jsx
// Project:     Seasonal Entertainment
// Description: "Share with the games" (ShareSwitch.jsx, shareWithGames.js; docs/CALLS.md) on
//              the calls list, the New call form and a call's page: only organisers and admins
//              get it, on planned and live calls; it shows what the server has; while another
//              call is shared it asks whether to replace it, by its title — yes replaces, no
//              changes nothing (the form keeps its fields); a shared call says so to everyone.
// ============================================================

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.restoreAllMocks());

const CALL = (id, title, status, sharedWithGames = false) => ({
  id,
  title,
  status,
  sharedWithGames,
  description: '',
  createdBy: 'olga',
  chatRoom: null,
  scheduledFor: null,
  startedAt: status === 'live' ? '2026-10-19T18:00:00Z' : null,
  endedAt: status === 'ended' ? '2026-10-18T19:00:00Z' : null,
});
const ELSEWHERE = {
  status: 409,
  body: {
    ok: false,
    error: 'shared_elsewhere',
    message: '"Town hall" is shared with the games already.',
    call: { id: 1, title: 'Town hall' },
  },
};
const QUESTION = '"Town hall" is shared with the games. Replace it with this call?';
// The server's answer to a PUT or POST: refused until it says replace.
const unlessReplace = (done) => (body) => (body.replace ? done : ELSEWHERE);

const listAnswers = (canManage) => ({
  'GET /calls/summary': { body: { ok: true, configured: true, live: true } },
  'GET /calls/bot-occurrences': { body: { ok: true, occurrences: [] } },
  'GET /calls': {
    body: {
      ok: true,
      configured: true,
      canManage,
      calls: {
        live: [CALL(1, 'Town hall', 'live', true)],
        upcoming: [CALL(2, 'Race night', 'scheduled')],
        recent: [CALL(3, 'Launch', 'ended')],
      },
    },
  },
});
const manager = () => signedIn({ username: 'olga', role: 'organiser' });
const switchOf = (title) =>
  screen.queryByRole('checkbox', { name: `Share ${title} with the games` });
const sentTo = (calls, key) => calls.filter((c) => c.key === key).map((c) => c.body);

it('the list: organisers get a switch on planned and live calls; members none', async () => {
  mockApi({ ...manager(), ...listAnswers(true) });
  const view = await renderApp('/calls');
  await screen.findByRole('link', { name: 'Open Town hall' });
  expect(switchOf('Town hall').checked).toBe(true);
  expect(switchOf('Race night').checked).toBe(false);
  expect(switchOf('Launch')).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Share with the games' })).toBeTruthy();
  view.unmount();

  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...listAnswers(false) });
  await renderApp('/calls');
  await screen.findByRole('link', { name: 'Open Town hall' });
  expect(screen.queryByRole('checkbox')).toBeNull();
  // Everyone is told which call is shared.
  expect(screen.getByText('Shared with the games')).toBeTruthy();
});

it('sharing a second call asks by the title: no changes nothing, yes replaces', async () => {
  const calls = mockApi({
    ...manager(),
    ...listAnswers(true),
    'PUT /calls/2/shared': unlessReplace({ body: { ok: true } }),
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await renderApp('/calls');
  await screen.findByRole('link', { name: 'Open Town hall' });
  const lists = () => sentTo(calls, 'GET /calls').length;
  const before = lists();
  fireEvent.click(switchOf('Race night'));
  await waitFor(() => expect(switchOf('Race night').disabled).toBe(false));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(QUESTION));
  expect(sentTo(calls, 'PUT /calls/2/shared')).toEqual([{ shared: true }]);
  expect(switchOf('Race night').checked).toBe(false);
  expect(lists()).toBe(before);
  expect(screen.queryByRole('alert')).toBeNull();

  confirm.mockReturnValue(true);
  fireEvent.click(switchOf('Race night'));
  // The list is read again: it says what is shared now.
  await waitFor(() => expect(lists()).toBe(before + 1));
  expect(sentTo(calls, 'PUT /calls/2/shared').slice(1)).toEqual([
    { shared: true },
    { shared: true, replace: true },
  ]);
});

it('unsharing sends shared: false; a refusal shows its message', async () => {
  const calls = mockApi({
    ...manager(),
    ...listAnswers(true),
    'PUT /calls/1/shared': {
      status: 409,
      body: { ok: false, error: 'wrong_status', message: 'An ended call cannot be shared.' },
    },
  });
  await renderApp('/calls');
  await screen.findByRole('link', { name: 'Open Town hall' });
  fireEvent.click(switchOf('Town hall'));
  expect(await screen.findByText('An ended call cannot be shared.')).toBeTruthy();
  expect(sentTo(calls, 'PUT /calls/1/shared')).toEqual([{ shared: false }]);
});

it('the New call form: shares as it creates; refused and kept so, nothing is created', async () => {
  const calls = mockApi({
    ...manager(),
    ...listAnswers(true),
    'POST /calls': unlessReplace({ status: 201, body: { ok: true, call: { id: 4 } } }),
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await renderApp('/calls');
  const title = await screen.findByLabelText('Title');
  fireEvent.change(title, { target: { value: 'Quiz' } });
  // Planned, so creating does not also start it.
  fireEvent.change(screen.getByLabelText('Planned start (optional)'), {
    target: { value: '2026-12-01T18:00' },
  });
  const box = screen.getByRole('checkbox', { name: 'Share with the games' });
  fireEvent.click(box);
  fireEvent.click(screen.getByRole('button', { name: 'Create call' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(QUESTION));
  expect(sentTo(calls, 'POST /calls')).toEqual([
    expect.objectContaining({ title: 'Quiz', sharedWithGames: true }),
  ]);
  expect(title.value).toBe('Quiz');
  expect(box.checked).toBe(true);

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Create call' }));
  await waitFor(() => expect(title.value).toBe(''));
  expect(sentTo(calls, 'POST /calls').at(-1)).toMatchObject({
    sharedWithGames: true,
    replace: true,
  });
});

const pageAnswers = (call, canManage) => ({
  'GET /calls/1': { body: { ok: true, call, canManage } },
  'GET /calls/1/recordings': { body: { ok: true, recordings: [] } },
  'GET /calls/1/polls': { body: { ok: true, polls: [] } },
});

it("a call's page: says when it is shared, with the switch for organisers only", async () => {
  const calls = mockApi({
    ...manager(),
    ...pageAnswers(CALL(1, 'Town hall', 'live', true), true),
    'PUT /calls/1/shared': { body: { ok: true } },
  });
  const view = await renderApp('/calls/1');
  expect(await screen.findByText(/· Shared with the games/)).toBeTruthy();
  const loads = () => sentTo(calls, 'GET /calls/1').length;
  const before = loads();
  fireEvent.click(switchOf('Town hall'));
  await waitFor(() => expect(loads()).toBe(before + 1));
  expect(sentTo(calls, 'PUT /calls/1/shared')).toEqual([{ shared: false }]);
  view.unmount();

  mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    ...pageAnswers(CALL(1, 'Town hall', 'live', true), false),
  });
  const member = await renderApp('/calls/1');
  expect(await screen.findByText(/· Shared with the games/)).toBeTruthy();
  expect(switchOf('Town hall')).toBeNull();
  member.unmount();

  mockApi({ ...manager(), ...pageAnswers(CALL(1, 'Town hall', 'ended'), true) });
  await renderApp('/calls/1');
  await screen.findByText('This call has ended.');
  expect(switchOf('Town hall')).toBeNull();
  expect(screen.queryByText(/Shared with the games/)).toBeNull();
});
