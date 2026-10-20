// ============================================================
// File:        sync.js
// Path:        server/src/reference/sync.js
// Project:     Seasonal Entertainment
// Description: Keeps the ETH, POL and BTC prices in the site's database (docs/BOTS.md, "Reference
//              prices"). Once a day per coin, everything the Demo plan offers is fetched again
//              (a year of daily points plus 90 days of hourly ones) and replaces what is stored,
//              and anything older than a year goes: CoinGecko's terms ask stored data to be
//              refreshed at least every 24 hours. In between, every hour, the last two days.
//              About 78 calls a day, one after another with a pause; after a failure that coin
//              waits an hour, the stored prices stay, and the log says so once until it works.
// ============================================================

import { COINS, marketChart } from './coingecko.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const YEAR_MS = 365 * DAY_MS;
const TICK_MS = 10 * 60_000;

// options: fetchImpl (tests), now (the clock), log, sleep (the pause between calls).
export function createReferenceSync(db, config, options = {}) {
  const {
    fetchImpl = fetch,
    now = () => Date.now(),
    log = console.warn,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;
  const { apiKey, timeoutMs, gapMs } = config.coingecko;
  const failedAt = new Map(); // token -> time of the last failure (a streak is logged once)
  const state = (token) =>
    db.prepare('SELECT full_at, hourly_at FROM reference_sync WHERE token = ?').get(token) ?? {
      full_at: 0,
      hourly_at: 0,
    };
  let calls = 0;
  const chart = async (token, days) => {
    if (calls++ > 0) await sleep(gapMs); // a pause before every call but the first of a tick
    return marketChart(token, days, { apiKey, timeoutMs, fetchImpl });
  };
  const insert = db.prepare(
    'INSERT OR REPLACE INTO reference_prices (ts_ms, token, price) VALUES (?, ?, ?)'
  );
  const mark = db.prepare(
    `INSERT INTO reference_sync (token, full_at, hourly_at) VALUES (?, ?, ?)
     ON CONFLICT (token) DO UPDATE SET full_at = excluded.full_at, hourly_at = excluded.hourly_at`
  );

  async function syncCoin(token) {
    const at = now();
    const { full_at: fullAt, hourly_at: hourlyAt } = state(token);
    if (at - (failedAt.get(token) ?? -Infinity) < HOUR_MS) return; // waits after a failure
    const full = at - fullAt >= DAY_MS;
    if (!full && at - hourlyAt < HOUR_MS) return;
    try {
      // A year: daily points; 90 days: hourly ones. Two days: the recent hours.
      const points = full
        ? [...(await chart(token, 365)), ...(await chart(token, 90))]
        : await chart(token, 2);
      db.transaction(() => {
        if (full) db.prepare('DELETE FROM reference_prices WHERE token = ?').run(token);
        for (const [ms, price] of points) insert.run(ms, token, price);
        db.prepare('DELETE FROM reference_prices WHERE token = ? AND ts_ms < ?').run(
          token,
          at - YEAR_MS
        );
        mark.run(token, full ? at : fullAt, at);
      })();
      if (failedAt.delete(token)) log(`[reference] CoinGecko works again for ${token}`);
    } catch (err) {
      if (!failedAt.has(token)) {
        log(`[reference] CoinGecko ${token}: ${err.message}; the stored prices stay`);
      }
      failedAt.set(token, at);
    }
  }

  let running = false; // a slow tick is never overlapped by the next one
  async function tick() {
    if (running) return;
    running = true;
    calls = 0;
    try {
      for (const token of Object.keys(COINS)) await syncCoin(token);
    } finally {
      running = false;
    }
  }

  // Every ten minutes: each coin decides whether its day or hour is due. Returns stop().
  function start() {
    tick();
    const timer = setInterval(tick, TICK_MS);
    timer.unref();
    return () => clearInterval(timer);
  }

  return { tick, start };
}
