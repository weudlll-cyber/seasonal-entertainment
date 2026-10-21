// ============================================================
// File:        callEventLink.test.js
// Path:        server/test/callEventLink.test.js
// Project:     Seasonal Entertainment
// Description: Guards linking calls to the event bot's occurrences (calls/eventLink.js,
//              eventRoutes.js) on a fixture event bot file: the picker lists the next 30 days'
//              scheduled occurrences to organisers only; a link is stored on creation and when
//              editing a planned call, and one call's answer names the event; an unknown
//              occurrence is refused; an occurrence that vanishes or moves is harmless (no
//              event, no error); an ended call cannot be relinked.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildEventFixture } from '../src/bots/fixtures.js';
import { callApp, newCall, organiser } from './helpers/calls.js';
import { registerUser } from './helpers/testApp.js';

let dir;
let eventDb;
let t;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-call-events-'));
  eventDb = path.join(dir, 'events.db');
  buildEventFixture(eventDb);
  ({ t } = callApp({ bots: { eventDb, cacheMs: 0 } }));
});
afterEach(() => {
  t?.close();
  rmSync(dir, { recursive: true, force: true });
});

// The fixture is this test's own file (never a real bot's): changed here as the bot would.
const changeBot = (sql, ...params) => {
  const bot = new Database(eventDb);
  bot.prepare(sql).run(...params);
  bot.close();
};

async function linkedCall() {
  const olga = await organiser(t);
  const { occurrences } = (await olga.get('/api/calls/bot-occurrences')).body;
  const [first] = occurrences;
  const res = await olga.post('/api/calls').send({ title: 'Town hall', botOccurrenceId: first.id });
  expect(res.status).toBe(201);
  return { olga, call: res.body.call, occurrence: first, occurrences };
}

describe('calls linked to bot events', () => {
  it('the picker: the next 30 days, scheduled only, for organisers only', async () => {
    const { occurrences } = await linkedCall();
    const now = Date.now();
    expect(occurrences.length).toBeGreaterThan(0);
    for (const o of occurrences) {
      expect(Object.keys(o).sort()).toEqual(['id', 'name', 'start']);
      expect(o.start).toBeGreaterThanOrEqual(now - 60_000);
      expect(o.start).toBeLessThan(now + 30 * 24 * 60 * 60_000);
    }
    const { agent: member } = await registerUser(t, 'mia');
    expect((await member.get('/api/calls/bot-occurrences')).status).toBe(403);
  });

  it('a link is stored, listed, and the call names its event', async () => {
    const { call, occurrence } = await linkedCall();
    expect(call).toMatchObject({
      botOccurrenceId: occurrence.id,
      botOccurrenceStart: occurrence.start,
    });
    const listed = (await t.client().get('/api/calls')).body.calls.upcoming[0];
    expect(listed.botOccurrenceId).toBe(occurrence.id);
    const one = (await t.client().get(`/api/calls/${call.id}`)).body.call;
    expect(one.event).toEqual({
      id: occurrence.id,
      name: occurrence.name,
      start: occurrence.start,
    });
  });

  it('editing a planned call links, relinks and unlinks; an ended call cannot', async () => {
    const olga = await organiser(t);
    const call = await newCall(olga);
    const [, second] = (await olga.get('/api/calls/bot-occurrences')).body.occurrences;
    const linked = await olga
      .put(`/api/calls/${call.id}/event`)
      .send({ botOccurrenceId: second.id });
    expect(linked.body.call.botOccurrenceId).toBe(second.id);
    const unlinked = await olga.put(`/api/calls/${call.id}/event`).send({ botOccurrenceId: null });
    expect(unlinked.body.call.botOccurrenceId).toBeNull();
    await olga.post(`/api/calls/${call.id}/end`);
    const late = await olga.put(`/api/calls/${call.id}/event`).send({ botOccurrenceId: second.id });
    expect(late.status).toBe(409);
  });

  it('an occurrence that is not an upcoming one is refused', async () => {
    const olga = await organiser(t);
    const res = await olga.post('/api/calls').send({ title: 'x', botOccurrenceId: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_event');
    expect((await t.client().get('/api/calls')).body.calls.upcoming).toEqual([]);
  });

  it('an occurrence that vanishes or moves is harmless: the call simply has no event', async () => {
    const { call, occurrence } = await linkedCall();
    changeBot(
      `INSERT INTO occurrence_overrides (occurrence_id, new_start_ts_utc, reason, created_at)
       VALUES (?, ?, 'moved', 'now')`,
      occurrence.id,
      new Date(occurrence.start + 60 * 60_000).toISOString()
    );
    const moved = await t.client().get(`/api/calls/${call.id}`);
    expect(moved.status).toBe(200);
    expect(moved.body.call.event).toBeNull();
    changeBot('DELETE FROM occurrences WHERE id = ?', occurrence.id);
    const gone = await t.client().get(`/api/calls/${call.id}`);
    expect(gone.status).toBe(200);
    expect(gone.body.call).toMatchObject({ title: 'Town hall', event: null });
  });
});
