// ============================================================
// File:        callsStale.test.js
// Path:        server/test/callsStale.test.js
// Project:     Seasonal Entertainment
// Description: The stale-call job (calls/staleCalls.js): a live call whose room is gone from
//              the call service is ended after 10 minutes without it, like "End call" (status,
//              read-only chat, audit by "system"); a call with its room is not; a room that
//              comes back restarts the grace; an unreachable call service ends nothing; the
//              job runs at start only when background jobs are on.
// ============================================================

import { afterEach, expect, it, vi } from 'vitest';
import { endStaleCalls, STALE_AFTER_MS } from '../src/calls/staleCalls.js';
import { findCall } from '../src/calls/store.js';
import { callApp, liveCall, organiser } from './helpers/calls.js';
import { post } from './helpers/chat.js';

let t;
let service;
let stop;
afterEach(() => {
  stop?.();
  stop = null;
  t.close();
});

const MINUTE = 60_000;
const T0 = Date.parse('2026-10-19T20:00:00.000Z');
const check = (at) => endStaleCalls(t.db, service, t.app.locals.chat, T0 + at);
const lastAudit = () =>
  t.db
    .prepare('SELECT actor_name AS actor, action, target_id AS target FROM audit_log')
    .all()
    .at(-1);

// A live call whose room the call service no longer has.
async function callWithoutRoom() {
  const agent = await organiser(t);
  const call = await liveCall(agent);
  service.rooms.delete(findCall(t.db, call.id).roomName);
  return { agent, call };
}

it('ends a live call 10 minutes after its room was found gone, like "End call"', async () => {
  ({ t, service } = callApp());
  const { agent, call } = await callWithoutRoom();
  expect(await check(0)).toEqual([]); // first seen missing: the grace starts
  expect(await check(STALE_AFTER_MS - MINUTE)).toEqual([]);
  expect(findCall(t.db, call.id).status).toBe('live');

  expect(await check(STALE_AFTER_MS)).toEqual([call.id]);
  expect(findCall(t.db, call.id).status).toBe('ended');
  expect(service.log.at(-1)).toEqual(['close', findCall(t.db, call.id).roomName]);
  expect(lastAudit()).toEqual({ actor: 'system', action: 'call.end', target: String(call.id) });
  const res = await post(agent, call.chatRoom, 'after the call');
  expect(res.body.error).toBe('read_only');
  expect(await check(STALE_AFTER_MS * 2)).toEqual([]); // ended once
});

it('leaves a live call alone while its room exists', async () => {
  ({ t, service } = callApp());
  const call = await liveCall(await organiser(t));
  for (const at of [0, STALE_AFTER_MS, 6 * STALE_AFTER_MS]) expect(await check(at)).toEqual([]);
  expect(findCall(t.db, call.id).status).toBe('live');
});

it('restarts the grace when the room comes back in between', async () => {
  ({ t, service } = callApp());
  const { call } = await callWithoutRoom();
  const { roomName } = findCall(t.db, call.id);
  await check(0);
  service.rooms.add(roomName);
  await check(5 * MINUTE); // there again
  service.rooms.delete(roomName);
  await check(6 * MINUTE); // missing again, from here
  expect(await check(6 * MINUTE + STALE_AFTER_MS - MINUTE)).toEqual([]);
  expect(await check(6 * MINUTE + STALE_AFTER_MS)).toEqual([call.id]);
});

it('ends nothing while the call service cannot be reached', async () => {
  ({ t, service } = callApp());
  const { call } = await callWithoutRoom();
  service.existingRooms = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  for (const at of [0, STALE_AFTER_MS, 2 * STALE_AFTER_MS]) {
    await expect(check(at)).rejects.toThrow('ECONNREFUSED');
  }
  expect(findCall(t.db, call.id)).toMatchObject({ status: 'live' });
  expect(t.db.prepare('SELECT room_missing_since FROM calls').get().room_missing_since).toBe(null);
});

it('runs at start only when background jobs are on', async () => {
  ({ t, service } = callApp()); // the test apps have background jobs off
  await callWithoutRoom();
  const asked = vi.spyOn(service, 'existingRooms');
  expect(t.app.locals.calls.start()).toBe(null);
  expect(asked).not.toHaveBeenCalled();

  t.close();
  ({ t, service } = callApp({ backgroundJobs: true }));
  const { call } = await callWithoutRoom();
  stop = t.app.locals.calls.start(() => {});
  expect(stop).toBeTypeOf('function');
  // The check at start has found the room missing.
  await vi.waitFor(() => {
    const row = t.db.prepare('SELECT room_missing_since FROM calls WHERE id = ?').get(call.id);
    expect(row.room_missing_since).toBeTruthy();
  });
});
