// ============================================================
// File:        botEventGroups.test.js
// Path:        server/test/botEventGroups.test.js
// Project:     Seasonal Entertainment
// Description: One entry per event and start (server/src/bots/events.js, docs/BOTS.md): the
//              bot keeps one occurrence per announcing channel, the site lists them once, with
//              the platforms together per place and one link per place; canceled only when
//              every copy is, else the running copies' status and places; the lowest copy's id
//              plus every copy's id; a copy moved to another time is an entry of its own. On
//              the test's own fixture file, changed here as the bot would.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readBotDb } from '../src/bots/botDb.js';
import { botOccurrences } from '../src/bots/events.js';
import { buildEventFixture } from '../src/bots/fixtures.js';

const NOW = Date.parse('2026-10-21T12:34:00Z'); // a Wednesday
const MONDAY = Date.parse('2026-10-19T00:00:00Z');
const WEEK = 7 * 24 * 60 * 60_000;
const BATTLES = 'Seasonal Tokens Friday Battles';
const QUIZ = '[Sample] Bot Quiz Night';
let dir;
let file;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-bot-groups-'));
  file = path.join(dir, 'events.db');
  buildEventFixture(file, { now: NOW });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const week = () => readBotDb(file, (db) => botOccurrences(db, MONDAY, MONDAY + WEEK));
const named = (name) => week().filter((o) => o.name === name);

// The ids of an event's copies this week, by platform.
function copies(name) {
  const bot = new Database(file, { readonly: true });
  const rows = bot
    .prepare(
      `SELECT o.id, o.platform FROM occurrences o JOIN events e ON e.id = o.event_id
       WHERE e.name = ? AND o.start_ts_utc >= ? AND o.start_ts_utc < ? ORDER BY o.id`
    )
    .all(name, new Date(MONDAY).toISOString(), new Date(MONDAY + WEEK).toISOString());
  bot.close();
  return Object.fromEntries(rows.map((r) => [r.platform, r.id]));
}

// An override as the bot writes one: a new status or start for one copy.
function override(id, { status = null, start = null }) {
  const bot = new Database(file);
  bot
    .prepare(
      `INSERT INTO occurrence_overrides (occurrence_id, new_start_ts_utc, new_status, reason, created_at)
       VALUES (?, ?, ?, 'test', 'now')`
    )
    .run(id, start, status);
  bot.close();
}

it('lists an event at one start once, the platforms together per place', () => {
  const entries = week();
  expect(entries.map((o) => o.name).sort()).toEqual(
    [QUIZ, '[Sample] Bot Community Call', '[Sample] Bot Weekend Stream', BATTLES].sort()
  );
  const ids = copies(BATTLES);
  const [battles] = named(BATTLES);
  expect(battles.ids).toEqual([ids.discord, ids.telegram, ids.youtube]);
  expect(battles.id).toBe(ids.discord); // the lowest copy's
  expect(battles.places).toEqual([
    {
      platforms: ['discord', 'telegram'],
      locationLabel: 'Sample battle channel',
      locationUrl: 'https://example.org/battles',
    },
    {
      platforms: ['youtube'],
      locationLabel: 'Sample stream',
      locationUrl: 'https://example.org/battles-live',
    },
  ]);
  expect(named(QUIZ)[0].places).toEqual([
    {
      platforms: ['telegram', 'discord'],
      locationLabel: 'Sample quiz group',
      locationUrl: 'https://example.org/quiz',
    },
  ]);
});

it('is canceled only when every copy is; otherwise shows the running copies', () => {
  const ids = copies(BATTLES);
  override(ids.discord, { status: 'canceled' });
  const [one] = named(BATTLES);
  expect(one.status).toBe('scheduled');
  expect(one.ids).toHaveLength(3); // a canceled copy still counts for call links
  expect(one.places.map((p) => p.platforms)).toEqual([['telegram'], ['youtube']]);
  override(ids.telegram, { status: 'canceled' });
  override(ids.youtube, { status: 'canceled' });
  const [all] = named(BATTLES);
  expect(all.status).toBe('canceled');
  expect(all.places.map((p) => p.platforms)).toEqual([['discord', 'telegram'], ['youtube']]);
});

it('a done date with one canceled channel stays done', () => {
  override(copies(QUIZ).telegram, { status: 'canceled' });
  expect(named(QUIZ).map((o) => o.status)).toEqual(['done']);
});

it('a copy moved to another time is an entry of its own', () => {
  const ids = copies(QUIZ);
  const [before] = named(QUIZ);
  override(ids.discord, { start: new Date(before.start + 60 * 60_000).toISOString() });
  const moved = named(QUIZ);
  expect(moved.map((o) => [o.ids, o.start])).toEqual([
    [[ids.telegram], before.start],
    [[ids.discord], before.start + 60 * 60_000],
  ]);
});
