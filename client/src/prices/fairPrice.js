// ============================================================
// File:        fairPrice.js
// Path:        client/src/prices/fairPrice.js
// Project:     Seasonal Entertainment
// Description: The price bot's /value and /swap arithmetic, unchanged (docs/BOTS.md):
//              fairPrices is compute_fair_prices (bots/stpricebot/.../helpers/fair_prices.py),
//              fairTable its comparison and ranking, convert the /swap calculation with its
//              mining times (handlers/swap.py). Mining rates are tokens mined per hour.
// ============================================================

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// actual: { season: price }, rates: { season: tokens per hour }. Over the seasons that have a
// price: K = average(actual price) / average(1 / mining rate); a season's fair price is
// K / its rate. Averaging both sides over the same seasons keeps K consistent when one price
// is missing (as the bot does). null when no season has a price.
export function fairPrices(actual, rates) {
  const priced = SEASONS.filter((s) => actual[s]);
  if (priced.length === 0) return null;
  const k = mean(priced.map((s) => actual[s])) / mean(priced.map((s) => 1 / rates[s]));
  return Object.fromEntries(SEASONS.map((s) => [s, k / rates[s]]));
}

// One row per priced season: actual, fair, deviation in % ((actual - fair) / fair × 100),
// underpriced (actual below fair) and rank (1 = best buy: the lowest actual / fair).
export function fairTable(actual, rates) {
  const fair = fairPrices(actual, rates);
  if (!fair) return [];
  const rows = SEASONS.filter((s) => actual[s]).map((season) => ({
    season,
    actual: actual[season],
    fair: fair[season],
    deviation: ((actual[season] - fair[season]) / fair[season]) * 100,
    underpriced: actual[season] < fair[season],
  }));
  const byValue = [...rows].sort((a, b) => a.actual / a.fair - b.actual / b.fair);
  return rows.map((row) => ({ ...row, rank: byValue.indexOf(row) + 1 }));
}

// amount of `from` into `to` at their prices; the mining time in hours of each side that is a
// season (from: the amount entered; to: the converted amount), null for ETH or without rates.
export function convert(amount, from, to, prices, rates) {
  const converted = (amount * prices[from]) / prices[to];
  const hours = (token, tokens) => (rates?.[token] > 0 ? tokens / rates[token] : null);
  return { converted, hoursFrom: hours(from, amount), hoursTo: hours(to, converted) };
}

// "12.50 hours", and the days too over 48 hours: "120.00 hours (5.0 days)".
export function formatHours(hours) {
  const text = `${hours.toFixed(2)} hours`;
  return hours > 48 ? `${text} (${(hours / 24).toFixed(1)} days)` : text;
}
