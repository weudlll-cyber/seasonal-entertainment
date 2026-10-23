// ============================================================
// File:        sources.js
// Path:        server/src/recap/sources.js
// Project:     Seasonal Entertainment
// Description: The weekly recap's facts, each from its one source (docs/CHAT.md, "Weekly
//              recap"): the price bot's snapshots (read-only, bots/botDb.js: the 7-day history
//              of bots/prices.js, from its first to its last price), the event bot's
//              occurrences and the site's calls merged as "Up next" merges them
//              (shared/callEntries.js), and the call recordings that finished in the window.
//              A bot that is not set up or cannot be read gives nothing, never a guess.
// ============================================================

import { withCalls } from '@seasonal-entertainment/shared/callEntries.js';
import { readBotDb } from '../bots/botDb.js';
import { botOccurrences } from '../bots/events.js';
import { PRICE_TOKENS, priceHistory } from '../bots/prices.js';
import { listCalls } from '../calls/store.js';

const DAY_MS = 24 * 60 * 60_000;

// A bot's file read, or `empty` when it is not set up or the read fails (logged).
function fromBot(file, read, empty, log) {
  if (!file) return empty;
  try {
    return readBotDb(file, read);
  } catch (error) {
    log(`[recap] a bot file could not be read: ${error.message}`);
    return empty;
  }
}

// [{ token, change }]: the change from the first to the last price of the past 7 days; a
// token with fewer than two prices is left out.
export function priceChanges(config, log) {
  return fromBot(
    config.bots.priceDb,
    (db) =>
      PRICE_TOKENS.flatMap((token) => {
        const points = priceHistory(db, token, '7d');
        if (points.length < 2 || !points[0][1]) return [];
        return [{ token, change: (points.at(-1)[1] - points[0][1]) / points[0][1] }];
      }),
    [],
    log
  );
}

// The next 7 days from `now`: the bot's occurrences and the site's live and planned calls.
export function upcomingWeek(db, config, callsConfigured, now, log) {
  const to = now + 7 * DAY_MS;
  const occurrences = fromBot(config.bots.eventDb, (bot) => botOccurrences(bot, now, to), [], log);
  const calls = { configured: callsConfigured, calls: callsConfigured ? listCalls(db) : null };
  return withCalls(occurrences, calls, { from: now, to });
}

// Recordings finished in the past 7 days, oldest first: { callId, title, startedAt }.
export function recentRecordings(db, now) {
  return db
    .prepare(
      `SELECT r.call_id AS callId, c.title, r.started_at AS startedAt
       FROM call_recordings r JOIN calls c ON c.id = r.call_id
       WHERE r.stopped_at IS NOT NULL AND r.stopped_at >= ? ORDER BY r.id`
    )
    .all(new Date(now - 7 * DAY_MS).toISOString());
}
