// ============================================================
// File:        routes.js
// Path:        server/src/bots/routes.js
// Project:     Seasonal Entertainment
// Description: Public reads of the owner's bot data (docs/BOTS.md), guests included:
//              GET /api/prices (latest prices, 24-hour change, sparkline), GET
//              /api/prices/:token?range= (history: 24h, 7d, 30d, 1y, all; at most 500 points)
//              and GET /api/bot-events?from=&to= (the event bot's occurrences in a window of at
//              most eight days). A bot whose file is not configured answers connected: false.
//              Answers are cached in memory (config.bots.cacheMs) and rate limited per address.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { cachedRead, readBotDb } from './botDb.js';
import { botOccurrences } from './events.js';
import { PRICE_RANGES, PRICE_TOKENS, latestPrices, priceHistory } from './prices.js';

const MAX_WINDOW_MS = 8 * 24 * 60 * 60_000; // a week in any time zone, with room for DST

export function botRoutes(config) {
  const { priceDb, eventDb, cacheMs } = config.bots;
  const cached = cachedRead(cacheMs);
  const limit = makeLimiter(config.rateLimits.botRead);

  // The bot's answer, or 503 when its file cannot be read now (missing, locked, replaced). The
  // reason goes to the log only; failures are not cached, so the next request tries again.
  function answer(res, file, key, read, shape) {
    try {
      res.json({ ok: true, connected: true, ...shape(cached(key, () => readBotDb(file, read))) });
    } catch (err) {
      console.error(`[bots] cannot read ${file}: ${err.message}`);
      sendError(res, 503, 'bot_unavailable', 'This data cannot be read right now.');
    }
  }

  const prices = express.Router();
  prices.get('/', allow('public'), limit, (_req, res) => {
    if (!priceDb) return res.json({ ok: true, connected: false, prices: [] });
    answer(res, priceDb, 'latest', latestPrices, (list) => ({ prices: list }));
  });
  prices.get('/:token', allow('public'), limit, (req, res) => {
    const { token } = req.params;
    const range = req.query.range ?? '7d';
    if (!PRICE_TOKENS.includes(token)) return sendError(res, 404, 'not_found', 'No such token.');
    if (!Object.hasOwn(PRICE_RANGES, range))
      return sendError(res, 400, 'invalid_range', 'Range is one of 24h, 7d, 30d, 1y, all.');
    if (!priceDb) return res.json({ ok: true, connected: false, token, range, points: [] });
    answer(
      res,
      priceDb,
      `history:${token}:${range}`,
      (db) => priceHistory(db, token, range),
      (points) => ({ token, range, points })
    );
  });

  const events = express.Router();
  events.get('/', allow('public'), limit, (req, res) => {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from)
      return sendError(res, 400, 'invalid_window', 'from and to are times in milliseconds.');
    if (to - from > MAX_WINDOW_MS)
      return sendError(res, 400, 'invalid_window', 'The window is at most eight days.');
    if (!eventDb) return res.json({ ok: true, connected: false, occurrences: [] });
    answer(
      res,
      eventDb,
      `events:${from}:${to}`,
      (db) => botOccurrences(db, from, to),
      (occurrences) => ({ occurrences })
    );
  });

  return { prices, events };
}
