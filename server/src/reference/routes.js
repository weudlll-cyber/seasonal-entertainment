// ============================================================
// File:        routes.js
// Path:        server/src/reference/routes.js
// Project:     Seasonal Entertainment
// Description: Public reads of the reference prices (ETH, POL and BTC from CoinGecko, kept in
//              the site's database by sync.js; docs/BOTS.md, "Reference prices"), guests
//              included: GET /api/reference-prices (latest price, 24-hour change, sparkline)
//              and GET /api/reference-prices/:token?range= (history, the same ranges and at
//              most 500 points as the seasons, bots/prices.js). Without COINGECKO_API_KEY:
//              connected: false. Cached in memory and rate limited like the bots' reads.
// ============================================================

import express from 'express';
import { cachedRead } from '../bots/botDb.js';
import { PRICE_RANGES, latestPrices, priceHistory } from '../bots/prices.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { COINS } from './coingecko.js';

const SOURCE = { table: 'reference_prices', tokens: Object.keys(COINS) };

export function referenceRoutes(db, config) {
  const router = express.Router();
  const cached = cachedRead(config.bots.cacheMs);
  const limit = makeLimiter(config.rateLimits.botRead);
  const connected = Boolean(config.coingecko);

  router.get('/', allow('public'), limit, (_req, res) => {
    if (!connected) return res.json({ ok: true, connected, prices: [] });
    res.json({ ok: true, connected, prices: cached('latest', () => latestPrices(db, SOURCE)) });
  });

  router.get('/:token', allow('public'), limit, (req, res) => {
    const { token } = req.params;
    const range = req.query.range ?? '7d';
    if (!SOURCE.tokens.includes(token)) return sendError(res, 404, 'not_found', 'No such coin.');
    if (!Object.hasOwn(PRICE_RANGES, range))
      return sendError(res, 400, 'invalid_range', 'Range is one of 24h, 7d, 30d, 1y, all.');
    if (!connected) return res.json({ ok: true, connected, token, range, points: [] });
    const points = cached(`history:${token}:${range}`, () =>
      priceHistory(db, token, range, SOURCE)
    );
    res.json({ ok: true, connected, token, range, points });
  });

  return router;
}
