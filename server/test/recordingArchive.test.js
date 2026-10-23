// ============================================================
// File:        recordingArchive.test.js
// Path:        server/test/recordingArchive.test.js
// Project:     Seasonal Entertainment
// Description: The recordings archive and chapter marks (docs/CALLS.md, "Recording"): every
//              finished recording for the calls' audience (guests too), newest first, with its
//              call's title, its length and its chapters in time order, never a running one;
//              only organisers and admins add, change and delete chapters (audited), within
//              the recording and with a title of at most 80 characters; chapters go with
//              their recording.
// ============================================================

import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditActions } from './helpers/chat.js';
import { liveCall, mp4Lasting, organiser, recordingApp } from './helpers/calls.js';
import { registerUser } from './helpers/testApp.js';

let t;
let dir;
afterEach(() => {
  t?.close();
  rmSync(dir, { recursive: true, force: true });
});

// A finished recording of a new live call, its file lasting `seconds`: { call, recording }.
async function recorded(olga, title, seconds = 1800) {
  const call = await liveCall(olga, title);
  await olga.post(`/api/calls/${call.id}/recording/start`);
  await olga.post(`/api/calls/${call.id}/recording/stop`);
  const { id, file } = t.db
    .prepare('SELECT id, file FROM call_recordings WHERE call_id = ?')
    .get(call.id);
  writeFileSync(path.join(dir, file), mp4Lasting(seconds));
  return { call, recording: { id } };
}

function app() {
  ({ t, dir } = recordingApp());
}
const archive = async (agent) => (await agent.get('/api/calls/recordings')).body;
const chapters = (call, recording) => `/api/calls/${call.id}/recordings/${recording.id}/chapters`;

describe('the archive', () => {
  it('lists every finished recording for everyone, newest first, never a running one', async () => {
    app();
    const olga = await organiser(t);
    const first = await recorded(olga, 'Town hall');
    const second = await recorded(olga, 'AMA', 600);
    // A third call whose recording still runs.
    const running = await liveCall(olga, 'Still running');
    await olga.post(`/api/calls/${running.id}/recording/start`);

    const guest = await archive(t.client());
    expect(guest.canManage).toBe(false);
    expect(guest.recordings.map((r) => [r.callId, r.title, r.seconds])).toEqual([
      [second.call.id, 'AMA', 600],
      [first.call.id, 'Town hall', 1800],
    ]);
    expect((await archive(olga)).canManage).toBe(true);
    const { agent: mia } = await registerUser(t, 'mia');
    expect((await archive(mia)).recordings).toHaveLength(2);
  });
});

describe('chapters', () => {
  it('organisers add, change and delete them, audited; they show in time order', async () => {
    app();
    const olga = await organiser(t);
    const { call, recording } = await recorded(olga, 'Town hall');
    const add = (at, title) => olga.post(chapters(call, recording)).send({ at, title });
    expect((await add('12:30', 'Questions')).status).toBe(201);
    const intro = (await add('0:00', 'Welcome')).body.chapter;
    expect(intro).toMatchObject({ at: 0, title: 'Welcome' });

    const shown = async () =>
      (await t.client().get(`/api/calls/${call.id}/recordings`)).body.recordings[0].chapters;
    expect((await shown()).map((c) => [c.at, c.title])).toEqual([
      [0, 'Welcome'],
      [750, 'Questions'],
    ]);
    expect((await archive(t.client())).recordings[0].chapters).toHaveLength(2);

    const edited = await olga
      .put(`${chapters(call, recording)}/${intro.id}`)
      .send({ at: '0:05', title: 'Hello' });
    expect(edited.status).toBe(200);
    expect((await olga.delete(`${chapters(call, recording)}/${intro.id}`)).status).toBe(200);
    expect((await shown()).map((c) => c.title)).toEqual(['Questions']);
    expect(auditActions(t)).toEqual(
      expect.arrayContaining(['call.chapter_add', 'call.chapter_edit', 'call.chapter_delete'])
    );
  });

  it('members and guests cannot; times and titles are checked', async () => {
    app();
    const olga = await organiser(t);
    const { call, recording } = await recorded(olga, 'Town hall', 600);
    const { agent: mia } = await registerUser(t, 'mia');
    const body = { at: '1:00', title: 'Intro' };
    expect((await mia.post(chapters(call, recording)).send(body)).status).toBe(403);
    expect((await t.client().post(chapters(call, recording)).send(body)).status).toBe(401);
    const added = await olga.post(chapters(call, recording)).send(body);
    const id = added.body.chapter.id;
    expect((await mia.delete(`${chapters(call, recording)}/${id}`)).status).toBe(403);
    expect((await mia.put(`${chapters(call, recording)}/${id}`).send(body)).status).toBe(403);
    for (const bad of [
      { at: '90', title: 'No colon' },
      { at: '10:01', title: 'After the end' },
      { at: '1:00', title: '' },
      { at: '1:00', title: 'x'.repeat(81) },
    ]) {
      expect((await olga.post(chapters(call, recording)).send(bad)).status, bad.at).toBe(400);
    }
  });

  it('go with their recording', async () => {
    app();
    const olga = await organiser(t);
    const { call, recording } = await recorded(olga, 'Town hall');
    await olga.post(chapters(call, recording)).send({ at: '1:00', title: 'Intro' });
    await olga.delete(`/api/calls/${call.id}/recordings/${recording.id}`);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM call_recording_chapters').get().n).toBe(0);
  });
});
