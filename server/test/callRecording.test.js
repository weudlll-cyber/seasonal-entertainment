// ============================================================
// File:        callRecording.test.js
// Path:        server/test/callRecording.test.js
// Project:     Seasonal Entertainment
// Description: Guards call recording (calls/recordingRoutes.js) with the stand-in call service
//              (helpers/calls.js, which writes a file when a recording stops, as the egress
//              would): only organisers and admins start and stop it; the room's metadata and
//              the call's answers say it runs; while it runs, joining without confirming gets
//              no token; ending the call stops it; the finished recording plays for the call's
//              audience (calls are shown to everyone) and only once stopped; organisers delete
//              file and row; with recording not set up there is no button and no start.
// ============================================================

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditActions } from './helpers/chat.js';
import { TEST_KEYS, callApp, join, liveCall, organiser } from './helpers/calls.js';
import { registerUser } from './helpers/testApp.js';

let t;
let dir;
afterEach(() => {
  t?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

// An app whose calls record into a temporary folder (recording: false leaves it off).
function app({ recording = true } = {}) {
  dir = mkdtempSync(path.join(tmpdir(), 'se-recordings-'));
  const calls = {
    url: 'wss://calls.test',
    httpOrigin: 'https://calls.test',
    ...TEST_KEYS,
    recording: recording ? { dir, egressDir: dir } : null,
  };
  const started = callApp({ calls });
  t = started.t;
  return started.service;
}

const metadata = (service) => service.log.filter(([kind]) => kind === 'metadata').at(-1)?.[1];
const recordingsOf = async (agent, call) =>
  (await agent.get(`/api/calls/${call.id}/recordings`)).body.recordings;

describe('call recording', () => {
  it('only organisers and admins start and stop it; everyone in the call is told', async () => {
    const service = app();
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    const { agent: mia } = await registerUser(t, 'mia');
    expect((await mia.post(`/api/calls/${call.id}/recording/start`)).status).toBe(403);
    expect((await olga.post(`/api/calls/${call.id}/recording/start`)).status).toBe(200);
    expect(metadata(service)).toMatchObject({ recording: true });
    expect((await t.client().get(`/api/calls/${call.id}`)).body.call.recording).toBe(true);
    const listed = (await t.client().get('/api/calls')).body.calls.live[0];
    expect(listed.recording).toBe(true);
    expect((await olga.post(`/api/calls/${call.id}/recording/start`)).status).toBe(409);
    expect((await mia.post(`/api/calls/${call.id}/recording/stop`)).status).toBe(403);
    expect((await olga.post(`/api/calls/${call.id}/recording/stop`)).status).toBe(200);
    expect(metadata(service)).toMatchObject({ recording: false });
    expect(await recordingsOf(t.client(), call)).toHaveLength(1);
    expect(auditActions(t)).toEqual(
      expect.arrayContaining(['call.recording_start', 'call.recording_stop'])
    );
  });

  it('while it runs, joining without confirming gets no token', async () => {
    const service = app();
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    await olga.post(`/api/calls/${call.id}/recording/start`);
    const { agent: mia } = await registerUser(t, 'mia');
    const refused = await mia.post(`/api/calls/${call.id}/join`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('recording_consent');
    expect(refused.body.token).toBeUndefined();
    const guestRefused = await t.client().post(`/api/calls/${call.id}/join`).send({});
    expect(guestRefused.status).toBe(409);
    const agreed = await mia.post(`/api/calls/${call.id}/join`).send({ recordingConsent: true });
    expect(agreed.status).toBe(200);
    expect(agreed.body.token).toEqual(expect.any(String));
    // Not recording: no confirmation needed.
    await olga.post(`/api/calls/${call.id}/recording/stop`);
    expect((await join(t.client(), service, call)).token).toEqual(expect.any(String));
  });

  it('ending the call stops the recording', async () => {
    const service = app();
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    await olga.post(`/api/calls/${call.id}/recording/start`);
    await olga.post(`/api/calls/${call.id}/end`);
    expect(service.log.some(([kind]) => kind === 'recordStop')).toBe(true);
    const [recording] = await recordingsOf(t.client(), call);
    expect(recording.seconds).toEqual(expect.any(Number));
  });

  it('plays for the call audience, only once stopped; organisers delete file and row', async () => {
    app();
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    await olga.post(`/api/calls/${call.id}/recording/start`);
    // Running: not listed and not playable yet, though the egress writes the file as it goes.
    const running = t.db.prepare('SELECT id, file FROM call_recordings').get();
    const runningId = running.id;
    writeFileSync(path.join(dir, running.file), 'partial mp4 bytes');
    const url = `/api/calls/${call.id}/recordings/${runningId}/video`;
    expect((await t.client().get(url)).status).toBe(404);
    await olga.post(`/api/calls/${call.id}/recording/stop`);
    const [recording] = await recordingsOf(t.client(), call);
    const played = await t.client().get(url);
    expect(played.status).toBe(200);
    expect(played.headers['content-type']).toBe('video/mp4');
    // Seeking: a range request answers part of the file.
    expect((await t.client().get(url).set('Range', 'bytes=0-3')).status).toBe(206);
    // Under another call's address: not found.
    const other = await liveCall(olga, 'Other');
    expect(
      (await t.client().get(`/api/calls/${other.id}/recordings/${recording.id}/video`)).status
    ).toBe(404);
    const { agent: mia } = await registerUser(t, 'mia');
    expect((await mia.delete(`/api/calls/${call.id}/recordings/${recording.id}`)).status).toBe(403);
    const file = t.db.prepare('SELECT file FROM call_recordings').get().file;
    expect(existsSync(path.join(dir, file))).toBe(true);
    expect((await olga.delete(`/api/calls/${call.id}/recordings/${recording.id}`)).status).toBe(
      200
    );
    expect(existsSync(path.join(dir, file))).toBe(false);
    expect(await recordingsOf(t.client(), call)).toEqual([]);
    expect(auditActions(t)).toContain('call.recording_delete');
  });

  it('recording not set up: no button, no start', async () => {
    app({ recording: false });
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    expect((await t.client().get(`/api/calls/${call.id}`)).body.recordingEnabled).toBe(false);
    const res = await olga.post(`/api/calls/${call.id}/recording/start`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('recording_off');
  });
});
