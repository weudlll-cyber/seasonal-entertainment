// ============================================================
// File:        coingecko.js
// Path:        server/src/reference/coingecko.js
// Project:     Seasonal Entertainment
// Description: The one call this site makes to CoinGecko's free Demo API (docs/BOTS.md,
//              "Reference prices"): a coin's USD market chart over a number of days. The address
//              is fixed (api.coingecko.com, the demo base URL) and the key goes in the
//              x-cg-demo-api-key header, never in the URL or a log. The Demo plan returns hourly
//              points for 2 to 90 days and daily points (00:00 UTC) beyond, at most 365 days back.
// ============================================================

const BASE = 'https://api.coingecko.com/api/v3';
// CoinGecko's coin ids (checked 2026-10-20): POL is "polygon-ecosystem-token" (ex-MATIC).
export const COINS = { eth: 'ethereum', pol: 'polygon-ecosystem-token' };

// Resolves [[ms, price], ...]; throws with a short reason (status, timeout, bad answer).
// fetchImpl: the global fetch, or a stand-in in tests.
export async function marketChart(token, days, { apiKey, timeoutMs, fetchImpl = fetch }) {
  const url = `${BASE}/coins/${COINS[token]}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'x-cg-demo-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const { prices } = await res.json();
  const valid = Array.isArray(prices)
    ? prices.filter(([ms, price]) => Number.isFinite(ms) && Number.isFinite(price) && price > 0)
    : [];
  if (valid.length === 0) throw new Error('no prices in the answer');
  return valid.map(([ms, price]) => [Math.round(ms), price]);
}
