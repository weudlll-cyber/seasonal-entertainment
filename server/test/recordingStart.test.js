// ============================================================
// File:        recordingStart.test.js
// Path:        server/test/recordingStart.test.js
// Project:     Seasonal Entertainment
// Description: Guards the honest recording state (calls/recordingStart.js; docs/CALLS.md,
//              "Recording"): a started recording is "starting" until the egress reports it
//              active, then "active", in the call's answer and the room's metadata; an egress
//              that fails, or is not active within 60 s, is stopped, its row goes and the call
//              keeps the time of the failed start; a stop while it starts drops it without that
//              notice and ends the watch; a restart watches a starting recording again; a new
//              start clears the notice. With the stand-in call service and fake timers.
// ============================================================

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_MS, START_LIMIT_MS, resumeRecordingStarts } from '../src/calls/recordingStart.js';
import { liveCall, organiser, recordingApp } from './helpers/calls.js';

let t;
let dir;
let service;
beforeEach(async () => {
  ({ t, dir, service } = recordingApp());
  // The egress takes its time: "starting" until a test says otherwise.
  service.egressStatus = 'starting';
  // Only the timers the watch uses; the app's own requests run on real ones.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  t?.close();
  rmSync(dir, { recursive: true, force: true });
});

const metadata = () => service.log.filter(([kind]) => kind === 'metadata').at(-1)?.[1];
const callOf = async (call) => (await t.client().get(`/api/calls/${call.id}`)).body.call;
const kinds = (kind) => service.log.filter(([k]) => k === kind).length;

async function started() {
  const olga = await organiser(t);
  const call = await liveCall(olga, 'Town hall');
  expect((await olga.post(`/api/calls/${call.id}/recording/start`)).status).toBe(200);
  return { olga, call };
}

describe('a recording start', () => {
  it('is "starting" until the egress reports it active, then "active"', async () => {
    const { call } = await started();
    expect(await callOf(call)).toMatchObject({ recording: true, recordingState: 'starting' });
    expect(metadata()).toMatchObject({ recording: true, recordingState: 'starting' });
    service.egressStatus = 'active';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(await callOf(call)).toMatchObject({ recording: true, recordingState: 'active' });
    expect(metadata()).toMatchObject({ recording: true, recordingState: 'active' });
    // Active: nothing more is asked.
    const asked = kinds('recordState');
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(kinds('recordState')).toBe(asked);
  });

  it('an egress that fails: stopped, the row gone, the failed start noted', async () => {
    const { call } = await started();
    service.egressStatus = 'failed';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const now = await callOf(call);
    expect(now).toMatchObject({ recording: false, recordingState: null });
    expect(now.recordingFailedAt).toEqual(expect.any(String));
    expect(metadata()).toMatchObject({
      recording: false,
      recordingFailedAt: now.recordingFailedAt,
    });
    expect(kinds('recordStop')).toBe(1);
    expect((await t.client().get(`/api/calls/${call.id}/recordings`)).body.recordings).toEqual([]);
  });

  it('not active within 60 s: the same, and nothing is asked after', async () => {
    const { call } = await started();
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS - POLL_MS);
    expect((await callOf(call)).recordingState).toBe('starting');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(await callOf(call)).toMatchObject({ recording: false, recordingState: null });
    expect((await callOf(call)).recordingFailedAt).toEqual(expect.any(String));
    expect(kinds('recordStop')).toBe(1);
    const asked = kinds('recordState');
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(kinds('recordState')).toBe(asked);
  });

  it('a stop while it starts: stopped, no notice, the watch ends', async () => {
    const { olga, call } = await started();
    expect((await olga.post(`/api/calls/${call.id}/recording/stop`)).status).toBe(200);
    expect(await callOf(call)).toMatchObject({
      recording: false,
      recordingState: null,
      recordingFailedAt: null,
    });
    expect(kinds('recordStop')).toBe(1);
    const asked = kinds('recordState');
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS);
    expect(kinds('recordState')).toBe(asked);
    expect((await t.client().get(`/api/calls/${call.id}/recordings`)).body.recordings).toEqual([]);
  });

  it('after a restart a starting recording is watched again; a new start clears the notice', async () => {
    const { olga, call } = await started();
    // The watch of the old process is gone; the row is still starting.
    vi.clearAllTimers();
    resumeRecordingStarts(t.db, service);
    service.egressStatus = 'active';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect((await callOf(call)).recordingState).toBe('active');
    // A failed start, then a new one: the notice goes.
    await olga.post(`/api/calls/${call.id}/recording/stop`);
    service.egressStatus = 'aborted';
    await olga.post(`/api/calls/${call.id}/recording/start`);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect((await callOf(call)).recordingFailedAt).toEqual(expect.any(String));
    service.egressStatus = 'starting';
    await olga.post(`/api/calls/${call.id}/recording/start`);
    expect((await callOf(call)).recordingFailedAt).toBeNull();
  });
});
