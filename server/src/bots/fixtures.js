// ============================================================
// File:        fixtures.js
// Path:        server/src/bots/fixtures.js
// Project:     Seasonal Entertainment
// Description: Development and test data only, never used by the running site: builds the
//              two bot databases with the bots' exact schemas (weudlll-cyber/Seasonal-tokens:
//              stpricebot helpers/snapshots.py, stannouncebot db/schema.sql; only the tables
//              the site reads) and clearly fake, seeded sample data. Prices: hourly snapshots of
//              the four seasonal tokens with a seeded random walk, and fake mining rates
//              (buildMiningRates). Events: a few weekly events
//              around `now`, past ones done, one moved by an override (two overrides, the later
//              wins), one canceled this week, one inactive and one with a non-web link; three
//              with an image on the fixture's own image host (buildEventImages draws them), one
//              with an image the network guard refuses (http).
//              docs/BOTS.md, "Development data".
// ============================================================

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';

const BOT_TOKENS = ['spring', 'summer', 'autumn', 'winter'];
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

// A small seeded generator (mulberry32): the same data on every build.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const fresh = (file) => {
  rmSync(file, { force: true });
  return new Database(file);
};

// hours: how many hourly snapshots per token, ending at the last full hour before `now`.
export function buildPriceFixture(
  file,
  { now = Date.now(), hours = 365 * 24, seed = 20261020 } = {}
) {
  const db = fresh(file);
  db.exec(`CREATE TABLE IF NOT EXISTS snapshots (
    ts_ms INTEGER NOT NULL,
    token TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (ts_ms, token)
  )`);
  const random = seeded(seed);
  const insert = db.prepare('INSERT INTO snapshots (ts_ms, token, price) VALUES (?, ?, ?)');
  const last = Math.floor(now / HOUR_MS) * HOUR_MS;
  db.transaction(() => {
    BOT_TOKENS.forEach((token, index) => {
      // Around the tokens' real order of magnitude (a few tenths of a US cent), each its own walk.
      let price = 0.0024 + index * 0.0003;
      for (let h = hours - 1; h >= 0; h -= 1) {
        price *= Math.exp((random() - 0.5) * 0.02); // ±1 % per hour at most
        insert.run(last - h * HOUR_MS, token, Number(price.toPrecision(6)));
      }
    });
  })();
  db.close();
}

// The price bot's mining_rates.json, in its own format (season names capitalised, tokens mined
// per hour). Fake, round numbers: not the real rates.
export function buildMiningRates(file) {
  const rates = { Spring: 40, Summer: 30, Autumn: 60, Winter: 50 };
  writeFileSync(file, `${JSON.stringify(rates, null, 2)}\n`);
}

const EVENT_TABLES = `
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    image_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS occurrences (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    start_ts_utc TEXT NOT NULL,
    platform TEXT NOT NULL,
    location_url TEXT,
    location_label TEXT,
    source TEXT NOT NULL CHECK (source IN ('generated', 'manual')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled', 'done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS occurrence_overrides (
    id INTEGER PRIMARY KEY,
    occurrence_id INTEGER NOT NULL,
    new_start_ts_utc TEXT,
    new_platform TEXT,
    new_location_url TEXT,
    new_location_label TEXT,
    new_status TEXT CHECK (new_status IN ('scheduled', 'canceled', 'done')),
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (occurrence_id) REFERENCES occurrences (id) ON DELETE CASCADE
);`;

// The fixture's own image host (bots/fixtureNetwork.js answers it in development only).
const IMAGES = 'https://images.bot-fixtures.test';
// weekday: ISO (1 = Monday); hour and minute in UTC; image: the bot's image_url.
const SAMPLE_EVENTS = [
  {
    name: '[Sample] Bot Quiz Night',
    description: 'Fake event from the development fixture.',
    weekday: 2,
    hour: 20,
    minute: 0,
    platform: 'telegram',
    url: 'https://example.org/quiz',
    label: 'Sample quiz group',
    image: `${IMAGES}/quiz.png`,
  },
  {
    name: '[Sample] Bot Community Call',
    description: 'Fake event; this week moved by an override.',
    weekday: 4,
    hour: 17,
    minute: 0,
    platform: 'discord',
    url: 'https://example.org/call',
    label: 'Sample voice channel',
    image: `${IMAGES}/call.png`,
  },
  {
    // Its image is refused (http, not https): the event shows without one.
    name: '[Sample] Bot Weekend Stream',
    description: 'Fake event; this week canceled.',
    weekday: 6,
    hour: 15,
    minute: 0,
    platform: 'discord',
    url: 'tg://resolve?domain=example',
    label: 'Not a web link',
    image: 'http://images.bot-fixtures.test/stream.png',
  },
  {
    name: 'Seasonal Tokens Friday Battles',
    description: 'Fake event from the development fixture.',
    weekday: 5,
    hour: 22,
    minute: 0,
    platform: 'discord',
    url: 'https://example.org/battles',
    label: 'Sample battle channel',
    image: `${IMAGES}/battles.png`,
  },
  {
    name: '[Sample] Inactive bot event',
    description: 'Never shown: the event is inactive.',
    weekday: 3,
    hour: 12,
    minute: 0,
    platform: 'telegram',
    url: null,
    label: null,
    image: null,
    inactive: true,
  },
];

// The images the fixture events name, drawn as season-coloured cards with their name:
// [file, colour, text].
const SAMPLE_IMAGES = [
  ['quiz.png', '#afb84e', 'Quiz'],
  ['call.png', '#04aaf7', 'Call'],
  ['battles.png', '#e06e22', 'Battles'],
];

// The fixture's image files (PNG, 320 × 180) into dir, for bots/fixtureNetwork.js.
export async function buildEventImages(dir) {
  mkdirSync(dir, { recursive: true });
  for (const [file, colour, text] of SAMPLE_IMAGES) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <rect width="320" height="180" rx="16" fill="${colour}"/>
      <text x="160" y="100" font-family="sans-serif" font-size="40" font-weight="700"
        fill="#12161c" text-anchor="middle">${text}</text>
      <text x="160" y="140" font-family="sans-serif" font-size="18" fill="#12161c"
        text-anchor="middle">[Sample image]</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, file));
  }
}

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// Occurrences from two weeks back to four weeks ahead of `now`, as the bot would have generated.
export function buildEventFixture(file, { now = Date.now() } = {}) {
  const db = fresh(file);
  db.exec(EVENT_TABLES);
  const stamp = iso(now);
  const addEvent = db.prepare(
    'INSERT INTO events (name, description, category, image_url, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const addOccurrence = db.prepare(
    `INSERT INTO occurrences (event_id, start_ts_utc, platform, location_url, location_label, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'generated', ?, ?, ?)`
  );
  const addOverride = db.prepare(
    `INSERT INTO occurrence_overrides (occurrence_id, new_start_ts_utc, new_platform, new_location_url, new_location_label, new_status, reason, created_at)
     VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)`
  );
  // Monday 00:00 UTC of the current week.
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  db.transaction(() => {
    for (const event of SAMPLE_EVENTS) {
      const { name, description, weekday, hour, minute, platform, url, label } = event;
      const active = event.inactive ? 0 : 1;
      const eventId = Number(
        addEvent.run(name, description, 'sample', event.image, active, stamp, stamp).lastInsertRowid
      );
      for (let week = -2; week <= 4; week += 1) {
        const start =
          monday + week * 7 * DAY_MS + (weekday - 1) * DAY_MS + (hour * 60 + minute) * 60_000;
        const canceled = week === 0 && name === '[Sample] Bot Weekend Stream';
        const status = canceled ? 'canceled' : start < now ? 'done' : 'scheduled';
        const occurrenceId = Number(
          addOccurrence.run(eventId, iso(start), platform, url, label, status, stamp, stamp)
            .lastInsertRowid
        );
        if (week !== 0) continue;
        if (name === '[Sample] Bot Community Call') {
          // Two overrides; the bot (and the site) take the later one: 90 minutes later.
          addOverride.run(
            occurrenceId,
            iso(start + 30 * 60_000),
            'Old sample time',
            null,
            'first move',
            stamp
          );
          addOverride.run(
            occurrenceId,
            iso(start + 90 * 60_000),
            'Moved sample channel',
            null,
            'moved again',
            stamp
          );
        }
      }
    }
  })();
  db.close();
}
