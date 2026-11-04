// ============================================================
// File:        callDelete.test.js
// Path:        server/test/callDelete.test.js
// Project:     Seasonal Entertainment
// Description: Guards deleting a call (calls/deleteCall.js, docs/CALLS.md "Deleting a call"): an
//              admin deletes an ended call, and every row and file of it is gone — the call, its
//              participants, reminders, recordings (file too) and chapter marks, its chat room
//              with messages, uploads (files too), reports, mentions, favourites, mutes and read
//              markers — while the audit entry stays and the linked event bot occurrence is
//              untouched; organisers, members and guests are refused; a live or planned call is
//              refused with a clear message; pages still on its chat hear that the room is gone.
// ============================================================

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEventFixture } from '../src/bots/fixtures.js';
import {
  fakeCallService,
  join,
  liveCall,
  newCall,
  organiser,
  recordingApp,
} from './helpers/calls.js';
import { auditActions } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { makeStaff, registerUser } from './helpers/testApp.js';
import { gpsJpeg, sendFile, upload, uploadedFiles } from './helpers/uploads.js';

let t;
let dirs = [];
let server;
afterEach(async () => {
  await stopServer(server);
  server = null;
  t?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

const count = (sql, ...params) => t.db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...params).n;

// An app recording into a temporary folder, with the event bot's fixture (this test's own file,
// never a real bot's) for a linked call.
function app() {
  const botDir = mkdtempSync(path.join(tmpdir(), 'se-call-delete-'));
  const eventDb = path.join(botDir, 'events.db');
  buildEventFixture(eventDb);
  const started = recordingApp({ bots: { eventDb, cacheMs: 0 } });
  t = started.t;
  dirs = [botDir, started.dir];
  return { ...started, eventDb };
}

describe('deleting a call', () => {
  it('an admin deletes an ended call with everything of it; the audit entry and the bot event stay', async () => {
    const { service, dir, eventDb } = app();
    const olga = await organiser(t);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { agent: mia, user: miaUser } = await registerUser(t, 'mia');
    const [occurrence] = (await olga.get('/api/calls/bot-occurrences')).body.occurrences;
    const botRows = () => {
      const bot = new Database(eventDb, { readonly: true });
      try {
        return bot.prepare('SELECT * FROM occurrences ORDER BY id').all();
      } finally {
        bot.close();
      }
    };
    const botBefore = botRows();

    // A planned call linked to the bot's event, a reminder, then live: a participant, a
    // recording with a chapter mark, and its chat with a picture, a mention and a report.
    const created = await olga
      .post('/api/calls')
      .send({ title: 'Test call', botOccurrenceId: occurrence.id });
    const call = created.body.call;
    expect((await mia.put(`/api/calls/${call.id}/reminder`)).status).toBe(200);
    await olga.post(`/api/calls/${call.id}/start`);
    await join(mia, service, call);
    await olga.post(`/api/calls/${call.id}/recording/start`);
    await olga.post(`/api/calls/${call.id}/recording/stop`);
    const { id: recordingId, file: recordingFile } = t.db
      .prepare('SELECT id, file FROM call_recordings')
      .get();
    expect(
      (
        await olga
          .post(`/api/calls/${call.id}/recordings/${recordingId}/chapters`)
          .send({ at: '0:10', title: 'Welcome' })
      ).status
    ).toBe(201);
    const room = call.chatRoom;
    const uploaded = (await upload(mia, await gpsJpeg())).body.upload;
    const sent = (await sendFile(mia, uploaded.id, 'hi @olga', room)).body.message;
    await olga.post(`/api/chat/messages/${sent.id}/report`).send({ reason: 'test' });
    await mia.put(`/api/chat/favourites/rooms/${room}`);
    await mia.put(`/api/chat/rooms/${room}/mute`);
    await mia.post(`/api/chat/rooms/${room}/read`).send({ lastId: sent.id });
    await olga.post(`/api/calls/${call.id}/end`);
    // Ending clears the call's reminders (reminders.js); one left from before that rule stays.
    t.db
      .prepare('INSERT INTO call_reminders (user_id, call_id, created_at) VALUES (?, ?, ?)')
      .run(miaUser.id, call.id, new Date().toISOString());
    const roomId = t.db.prepare('SELECT id FROM chat_rooms WHERE slug = ?').get(room).id;
    // Everything is there before.
    const related = () => ({
      calls: count('calls WHERE id = ?', call.id),
      participants: count('call_participants WHERE call_id = ?', call.id),
      reminders: count('call_reminders WHERE call_id = ?', call.id),
      recordings: count('call_recordings WHERE call_id = ?', call.id),
      chapters: count('call_recording_chapters WHERE recording_id = ?', recordingId),
      room: count('chat_rooms WHERE id = ?', roomId),
      messages: count('chat_messages WHERE room_id = ?', roomId),
      uploads: count('chat_uploads WHERE id = ?', uploaded.id),
      reports: count('chat_reports WHERE message_id = ?', sent.id),
      mentions: count('chat_mentions WHERE message_id = ?', sent.id),
      favourites: count('chat_favourite_rooms WHERE room_id = ?', roomId),
      mutes: count('chat_room_mutes WHERE room_id = ?', roomId),
      reads: count("chat_reads WHERE scope = 'room' AND target_id = ?", roomId),
    });
    for (const [what, n] of Object.entries(related())) expect(n, what).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, recordingFile))).toBe(true);
    expect(uploadedFiles(t.config).length).toBeGreaterThan(0);

    const res = await admin.delete(`/api/calls/${call.id}`);
    expect(res.status).toBe(200);
    for (const [what, n] of Object.entries(related())) expect(n, what).toBe(0);
    expect(existsSync(path.join(dir, recordingFile))).toBe(false);
    expect(uploadedFiles(t.config)).toEqual([]);
    expect((await t.client().get(`/api/calls/${call.id}`)).status).toBe(404);
    expect((await t.client().get('/api/calls')).body.calls.recent).toEqual([]);
    // The audit entry: who, when, the call's id and title.
    const entry = t.db
      .prepare(
        "SELECT actor_name, target_id, before, at FROM audit_log WHERE action = 'call.delete'"
      )
      .get();
    expect(entry).toMatchObject({ actor_name: 'ada', target_id: String(call.id) });
    expect(JSON.parse(entry.before)).toEqual({ title: 'Test call' });
    expect(entry.at).toBeTruthy();
    expect(auditActions(t)).toContain('call.create'); // the earlier entries stay too
    // The bot's own data is untouched, and its event is still offered.
    expect(botRows()).toEqual(botBefore);
    const offered = (await olga.get('/api/calls/bot-occurrences')).body.occurrences;
    expect(offered.map((o) => o.id)).toContain(occurrence.id);
    // Mia's account and her other data stay.
    expect(count('users WHERE id = ?', miaUser.id)).toBe(1);
  });

  it('only admins: organisers, members and guests are refused, and nothing goes', async () => {
    app();
    const olga = await organiser(t);
    const { agent: mia } = await registerUser(t, 'mia');
    const call = await liveCall(olga, 'Kept');
    await olga.post(`/api/calls/${call.id}/end`);
    expect((await olga.delete(`/api/calls/${call.id}`)).status).toBe(403);
    expect((await mia.delete(`/api/calls/${call.id}`)).status).toBe(403);
    expect((await t.client().delete(`/api/calls/${call.id}`)).status).toBe(401);
    expect(count('calls WHERE id = ?', call.id)).toBe(1);
  });

  it('a live or planned call is refused with a clear message', async () => {
    app();
    const olga = await organiser(t);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const planned = await newCall(olga, 'Planned');
    const live = await liveCall(olga, 'Live');
    const refusedPlanned = await admin.delete(`/api/calls/${planned.id}`);
    expect([refusedPlanned.status, refusedPlanned.body.message]).toEqual([
      409,
      'Cancel the call first: only an ended call can be deleted.',
    ]);
    const refusedLive = await admin.delete(`/api/calls/${live.id}`);
    expect([refusedLive.status, refusedLive.body.message]).toEqual([
      409,
      'End the call first: a live call cannot be deleted.',
    ]);
    expect(count('calls')).toBe(2);
    // Cancelled (ended) first, the planned one can go.
    await olga.post(`/api/calls/${planned.id}/end`);
    expect((await admin.delete(`/api/calls/${planned.id}`)).status).toBe(200);
  });

  it('pages still on its chat hear that the room is gone', async () => {
    let url;
    ({ t, server, url } = await listeningChat({}, { callService: fakeCallService() }));
    const olga = await organiser(t);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const call = await liveCall(olga, 'Watched');
    await olga.post(`/api/calls/${call.id}/end`);
    const page = connect(url, { cookie: cookieOf(olga) });
    await page.opened;
    expect((await page.subscribe(call.chatRoom)).type).toBe('subscribed');
    expect((await admin.delete(`/api/calls/${call.id}`)).status).toBe(200);
    expect(await page.next('error')).toEqual({
      type: 'error',
      error: 'not_allowed',
      room: call.chatRoom,
    });
    page.ws.close();
  });
});
