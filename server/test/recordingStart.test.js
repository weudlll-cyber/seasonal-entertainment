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
//              start clears the notice. A call recorded from its start: off by default; on, starting
//              it (at once or planned) starts the recording, "waiting" with no 60 s rule until
//              the egress records; the room closing or the call ending first drops it without a
//              notice; a recording that cannot start leaves the call running with the notice;
//              "Recording allowed" off records nothing. With the stand-in call service and fake
//              timers.
// ============================================================

import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_MS, START_LIMIT_MS, resumeRecordingStarts } from '../src/calls/recordingStart.js';
import { setSetting } from '../src/settings/store.js';
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

describe('a call recorded from its start', () => {
  // Creates a call (planned or not) with the option, then starts it as an organiser.
  async function startedWith(recordFromStart, extra = {}) {
    const olga = await organiser(t);
    const made = await olga
      .post('/api/calls')
      .send({ title: 'Town hall', recordFromStart, ...extra });
    expect(made.status).toBe(201);
    const call = made.body.call;
    const start = await olga.post(`/api/calls/${call.id}/start`);
    expect(start.status).toBe(200);
    return { olga, call };
  }

  it('off (the default): starting the call records nothing', async () => {
    const { call } = await startedWith(undefined);
    expect(kinds('recordStart')).toBe(0);
    expect(await callOf(call)).toMatchObject({ recordFromStart: false, recording: false });
  });

  it.each([
    ['started at once (quick start)', {}],
    ['a planned call, started later', { scheduledFor: '2026-12-01T19:00:00Z' }],
  ])('%s: the recording starts with it, waiting for the first speaker', async (_name, extra) => {
    const { call } = await startedWith(true, extra);
    expect(kinds('recordStart')).toBe(1);
    expect(await callOf(call)).toMatchObject({ recordFromStart: true, recordingState: 'waiting' });
    expect(metadata()).toMatchObject({ recording: true, recordingState: 'waiting' });
    // No 60 s rule: it waits as long as nobody speaks.
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS * 2);
    expect((await callOf(call)).recordingState).toBe('waiting');
    service.egressStatus = 'active';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect((await callOf(call)).recordingState).toBe('active');
  });

  it('the room closes before anyone spoke: the row goes without a notice', async () => {
    const { call } = await startedWith(true);
    // The egress ends it when its room closes (the empty timeout).
    service.egressStatus = 'complete';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(await callOf(call)).toMatchObject({
      recording: false,
      recordingState: null,
      recordingFailedAt: null,
    });
  });

  it('the call ends before anyone spoke: stopped, no notice', async () => {
    const { olga, call } = await startedWith(true);
    expect((await olga.post(`/api/calls/${call.id}/end`)).status).toBe(200);
    expect(kinds('recordStop')).toBe(1);
    expect((await callOf(call)).recordingFailedAt).toBeNull();
    expect((await t.client().get(`/api/calls/${call.id}/recordings`)).body.recordings).toEqual([]);
  });

  it('a recording that cannot start: the call runs, the organisers get the notice', async () => {
    service.startRecording = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    const { call } = await startedWith(true);
    const now = await callOf(call);
    expect(now).toMatchObject({ status: 'live', recording: false });
    expect(now.recordingFailedAt).toEqual(expect.any(String));
    expect(metadata()).toMatchObject({ recordingFailedAt: now.recordingFailedAt });
  });

  it('"Recording allowed" off: the call starts without recording', async () => {
    setSetting(t.db, 'calls.recording', false);
    const { call } = await startedWith(true);
    expect(kinds('recordStart')).toBe(0);
    expect((await callOf(call)).recording).toBe(false);
  });

  it('the option must be yes or no', async () => {
    const olga = await organiser(t);
    const res = await olga.post('/api/calls').send({ title: 'Town hall', recordFromStart: 'yes' });
    expect(res.status).toBe(400);
  });
});
