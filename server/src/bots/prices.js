// ============================================================
// File:        prices.js
// Path:        server/src/bots/prices.js
// Project:     Seasonal Entertainment
// Description: The price bot's hourly snapshots (table snapshots(ts_ms, token, price), the four
//              seasonal tokens in lower case; docs/BOTS.md): each token's latest price with its
//              change over 24 hours and the last day's prices for a sparkline, and one token's
//              history over a range, thinned out to at most HISTORY_POINTS points. The same for
//              any table of that shape: the site's own ETH, POL and BTC prices (reference/) use it.
// ============================================================

export const PRICE_TOKENS = ['spring', 'summer', 'autumn', 'winter'];
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
// null: everything the bot has.
export const PRICE_RANGES = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '1y': 365 * DAY_MS,
  all: null,
};
export const HISTORY_POINTS = 500;
// Where the prices are: a table (ts_ms, token, price) and its tokens. Names are constants of
// this code, never input.
export const BOT_SNAPSHOTS = { table: 'snapshots', tokens: PRICE_TOKENS };

// [[ts, price], ...] of one token from `since` on (or all), oldest first.
const pointsSince = (db, table, token, since) =>
  db
    .prepare(`SELECT ts_ms, price FROM ${table} WHERE token = ? AND ts_ms >= ? ORDER BY ts_ms`)
    .raw()
    .all(token, since ?? 0);

// At most `max` points: the span is cut into equal time slices and each slice keeps its last
// snapshot (a real price at a real time, never an average that was never quoted).
export function thinOut(points, max = HISTORY_POINTS) {
  if (points.length <= max) return points;
  const first = points[0][0];
  const span = points.at(-1)[0] - first || 1;
  const slices = new Map();
  for (const point of points) {
    slices.set(Math.min(max - 1, Math.floor(((point[0] - first) / span) * max)), point);
  }
  return [...slices.values()];
}

// Per token: { token, price, at, change24h (fraction, null without a price a day earlier),
// spark: the last 24 hours' prices }. Tokens without a stored price are left out.
export function latestPrices(db, { table, tokens } = BOT_SNAPSHOTS) {
  return tokens.flatMap((token) => {
    const latest = db
      .prepare(`SELECT ts_ms, price FROM ${table} WHERE token = ? ORDER BY ts_ms DESC LIMIT 1`)
      .raw()
      .get(token);
    if (!latest) return [];
    const [at, price] = latest;
    const day = pointsSince(db, table, token, at - DAY_MS);
    // The snapshot closest to 24 hours before the latest one, if the bot has one that old.
    const before = day[0] && day[0][0] <= at - DAY_MS + HOUR_MS ? day[0][1] : null;
    return [
      {
        token,
        price,
        at,
        change24h: before ? (price - before) / before : null,
        spark: day.map(([, p]) => p),
      },
    ];
  });
}

// One token over a range (a key of PRICE_RANGES), counted back from its latest snapshot.
export function priceHistory(db, token, range, { table } = BOT_SNAPSHOTS) {
  const latest = db.prepare(`SELECT MAX(ts_ms) AS at FROM ${table} WHERE token = ?`).get(token).at;
  if (latest === null) return [];
  const length = PRICE_RANGES[range];
  return thinOut(pointsSince(db, table, token, length === null ? null : latest - length));
}
