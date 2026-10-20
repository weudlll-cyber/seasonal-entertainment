// ============================================================
// File:        schema.js
// Path:        server/src/reference/schema.js
// Project:     Seasonal Entertainment
// Description: Reference prices (ETH, POL and BTC, from CoinGecko; docs/BOTS.md, "Reference
//              prices"), kept in the site's own database: one row per coin and time, in the same
//              shape as the price bot's snapshots (ts_ms, token, price), so bots/prices.js reads
//              both. reference_sync remembers when each coin was last fetched completely (once a
//              day) and recently (every hour), so a restart does not fetch again.
// ============================================================

export const REFERENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS reference_prices (
  ts_ms INTEGER NOT NULL,
  token TEXT    NOT NULL,
  price REAL    NOT NULL,
  PRIMARY KEY (ts_ms, token)
);
CREATE TABLE IF NOT EXISTS reference_sync (
  token     TEXT    PRIMARY KEY,
  full_at   INTEGER NOT NULL DEFAULT 0,
  hourly_at INTEGER NOT NULL DEFAULT 0
);
`;
