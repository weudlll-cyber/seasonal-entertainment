// ============================================================
// File:        recap.test.js
// Path:        server/test/recap.test.js
// Project:     Seasonal Entertainment
// Description: Guards the weekly recap (server/src/recap/, docs/CHAT.md, "Weekly recap"): posted by
//              the site itself in "announcements" from Monday 09:00 Vienna time, once per week and
//              not again after a restart, a new site's first on the next Monday; facts only from
//              the sources (the price bot's 7 days, the event bot and the site's calls, the
//              recordings of the week); a token without price data has no line, and without the
//              price bot there is no price part; the last line is the not-financial-advice notice;
//              "Weekly recap" notifications are off by default and reach only members who turned
//              them on; admins can post one now (audited), nobody else.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { formatDateTime } from '@seasonal-entertainment/shared/localWeek.js';
import { formatChange } from '@seasonal-entertainment/shared/priceChange.js';
import { readBotDb } from '../src/bots/botDb.js';
import { botOccurrences } from '../src/bots/events.js';
import { buildEventFixture, buildPriceFixture } from '../src/bots/fixtures.js';
import { createCall } from '../src/calls/store.js';
import { SYSTEM_SENDER } from '../src/chat/messages.js';
import { postRecap, weeklyRecapRound } from '../src/recap/job.js';
import { fakeCallService } from './helpers/calls.js';
import { auditActions, chatApp } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

const DAY = 24 * 60 * 60_000;
// Monday 26 October 2026, 09:00 in Vienna (CET, after the clock change) is 08:00 UTC.
const MONDAY_NINE = Date.parse('2026-10-26T08:00:00Z');
let dir;
let files;
let t;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-recap-'));
  files = { prices: path.join(dir, 'snapshots.db'), events: path.join(dir, 'events.db') };
  buildPriceFixture(files.prices, { now: MONDAY_NINE, hours: 10 * 24 });
  buildEventFixture(files.events, { now: MONDAY_NINE });
  return () => rmSync(dir, { recursive: true, force: true });
});
afterEach(() => t?.close());

const appWith = (bots = {}) => {
  t = chatApp(
    { bots: { priceDb: files.prices, eventDb: files.events, ...bots } },
    { callService: fakeCallService() }
  );
  return t;
};
const deps = () => ({
  db: t.db,
  config: t.config,
  chat: t.app.locals.chat,
  callsConfigured: true,
  log: () => {},
});
const recapsIn = (slug) =>
  t.db
    .prepare(
      `SELECT m.body, m.author_name AS author, m.author_user_id AS userId, m.author_system AS system
       FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id WHERE r.slug = ? ORDER BY m.id`
    )
    .all(slug);

describe('posting', () => {
  it('posts once per week from Monday 09:00 Vienna time, and not again after a restart', () => {
    appWith();
    expect(weeklyRecapRound(deps(), MONDAY_NINE - 60_000)).toBe(false); // 08:59
    expect(weeklyRecapRound(deps(), MONDAY_NINE)).toBe(true);
    expect(weeklyRecapRound(deps(), MONDAY_NINE + 60_000)).toBe(false);
    // A restart: new job state, the same database.
    expect(weeklyRecapRound(deps(), MONDAY_NINE + 2 * DAY)).toBe(false);
    expect(recapsIn('announcements')).toHaveLength(1);
    // The next Monday's.
    expect(weeklyRecapRound(deps(), MONDAY_NINE + 7 * DAY)).toBe(true);
    expect(recapsIn('announcements')).toHaveLength(2);
  });

  it('a new site first started on a Friday posts its first recap on Monday, not that day', () => {
    appWith();
    const friday = MONDAY_NINE - 3 * DAY;
    expect(weeklyRecapRound(deps(), friday)).toBe(false);
    expect(weeklyRecapRound(deps(), friday + 60 * 60_000)).toBe(false);
    expect(recapsIn('announcements')).toHaveLength(0);
    expect(weeklyRecapRound(deps(), MONDAY_NINE)).toBe(true);
  });

  it('comes from the site itself: no account and no guest behind it', async () => {
    appWith();
    postRecap(deps(), MONDAY_NINE);
    const [stored] = recapsIn('announcements');
    expect(stored).toMatchObject({ author: SYSTEM_SENDER, userId: null, system: 1 });
    const { agent } = await registerUser(t, 'mia');
    const [shown] = (await agent.get('/api/chat/rooms/announcements/messages')).body.messages;
    expect(shown).toMatchObject({
      author: 'Seasonal Entertainment',
      isSystem: true,
      authorId: null,
    });
  });

  it('falls back to "general" without an announcements room', () => {
    appWith();
    t.db.prepare("DELETE FROM chat_rooms WHERE slug = 'announcements'").run();
    expect(postRecap(deps(), MONDAY_NINE).room).toBe('general');
    expect(recapsIn('general')).toHaveLength(1);
  });
});

describe('content', () => {
  it('holds facts only from the sources, and the notice as its last line', async () => {
    appWith();
    const { user: organiser } = await registerUser(t, 'olga');
    const callId = createCall(
      t.db,
      { title: 'Community call', scheduledFor: new Date(MONDAY_NINE + 2 * DAY).toISOString() },
      organiser.id
    );
    t.db
      .prepare(
        `INSERT INTO call_recordings (call_id, egress_id, file, started_at, stopped_at, started_by)
         VALUES (?, 'eg', 'f.mp4', ?, ?, 'ada')`
      )
      .run(
        callId,
        new Date(MONDAY_NINE - DAY).toISOString(),
        new Date(MONDAY_NINE - DAY + 60_000).toISOString()
      );
    const lines = postRecap(deps(), MONDAY_NINE).body.split('\n');

    // Each price line: the first and the last price of the past 7 days in the bot's file.
    const changes = new Database(files.prices, { readonly: true });
    const expected = ['spring', 'summer', 'autumn', 'winter'].map((token) => {
      const [first, last] = ['ASC', 'DESC'].map(
        (order) =>
          changes
            .prepare(
              `SELECT price FROM snapshots WHERE token = ? AND ts_ms >= ? ORDER BY ts_ms ${order} LIMIT 1`
            )
            .get(token, MONDAY_NINE - 7 * DAY).price
      );
      return `- ${token[0].toUpperCase()}${token.slice(1)}: ${formatChange((last - first) / first)}`;
    });
    changes.close();
    // Each event line: one of the bot's occurrences in the next 7 days, or the call.
    const occurrences = readBotDb(files.events, (db) =>
      botOccurrences(db, MONDAY_NINE, MONDAY_NINE + 7 * DAY)
    );
    const eventLines = lines.slice(
      lines.indexOf('The next 7 days:') + 1,
      lines.indexOf('', lines.indexOf('The next 7 days:'))
    );
    expect(eventLines).toHaveLength(occurrences.length + 1);
    for (const o of occurrences) {
      expect(
        eventLines.some(
          (l) =>
            l.includes(o.name) && l.includes(formatDateTime(o.start, 'Europe/Vienna', MONDAY_NINE))
        )
      ).toBe(true);
    }
    expect(eventLines).toContain(
      `- ${formatDateTime(MONDAY_NINE + 2 * DAY, 'Europe/Vienna', MONDAY_NINE)}: Community call, a call on this site: /calls/${callId}`
    );

    expect(lines[0]).toBe('Weekly recap for the week of Monday 26 October');
    expect(lines.slice(2, 7)).toEqual(['Prices over the past 7 days:', ...expected]);
    expect(lines).toContain(
      `- Community call, ${formatDateTime(MONDAY_NINE - DAY, 'Europe/Vienna', MONDAY_NINE)}: /calls/${callId}`
    );
    expect(lines.at(-1)).toBe(
      'Information only — not financial advice. Disclaimer: /info/disclaimer'
    );
    // Nothing that sounds like advice.
    expect(lines.join('\n')).not.toMatch(/\b(buy|sell|hold|should|recommend)\b/i);
  });

  it('leaves out a token without price data, and the whole part without the price bot', () => {
    // A copy of the prices without Winter's.
    const partial = path.join(dir, 'partial.db');
    buildPriceFixture(partial, { now: MONDAY_NINE, hours: 10 * 24 });
    const db = new Database(partial);
    db.prepare("DELETE FROM snapshots WHERE token = 'winter'").run();
    db.close();
    appWith({ priceDb: partial });
    let body = postRecap(deps(), MONDAY_NINE).body;
    expect(body).toMatch(/^- Spring: /m);
    expect(body).not.toMatch(/Winter: /);
    t.close();

    appWith({ priceDb: null });
    body = postRecap(deps(), MONDAY_NINE).body;
    expect(body).not.toMatch(/Prices over the past 7 days/);
    expect(body.split('\n').at(-1)).toMatch(/^Information only — not financial advice\./);
  });
});

describe('notifications and admins', () => {
  it('"Weekly recap" is off by default; only members who turn it on get the event', async () => {
    appWith();
    const mia = await registerUser(t, 'mia');
    const leo = await registerUser(t, 'leo');
    expect((await mia.agent.get('/api/auth/session')).body.user.notifyRecap).toBe(false);
    expect(
      (await leo.agent.put('/api/auth/notifications').send({ notifyRecap: true })).status
    ).toBe(200);
    const sent = [];
    const chat = t.app.locals.chat;
    const listening = {
      ...chat,
      notify: { member: (userId, event) => sent.push([userId, event.type]) },
    };
    const message = postRecap({ ...deps(), chat: listening }, MONDAY_NINE);
    expect(sent).toEqual([[leo.user.id, 'recap']]);
    expect(message.room).toBe('announcements');
  });

  it('admins post one now (audited); members cannot', async () => {
    appWith();
    const { agent: member } = await registerUser(t, 'mia');
    expect((await member.post('/api/admin/recap')).status).toBe(403);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const res = await admin.post('/api/admin/recap');
    expect(res.status).toBe(201);
    expect(res.body.message.room).toBe('announcements');
    expect(auditActions(t)).toContain('recap.post');
    expect(recapsIn('announcements')).toHaveLength(1);
  });
});
