// ============================================================
// File:        priceFormat.js
// Path:        client/src/prices/priceFormat.js
// Project:     Seasonal Entertainment
// Description: The price data's shared pieces on the client (docs/BOTS.md): the four tokens
//              and the chart ranges as the server names them, and the formats: US dollars with
//              four significant digits below a cent (the tokens trade at fractions of a cent),
//              cents above; the 24-hour change as a signed percentage; times in the viewer's
//              local time.
// ============================================================

// Calendar order, as on the home page; `id` is the bot's token name and the colour token.
export const TOKENS = [
  { id: 'spring', name: 'Spring' },
  { id: 'summer', name: 'Summer' },
  { id: 'autumn', name: 'Autumn' },
  { id: 'winter', name: 'Winter' },
];
export const RANGES = ['24h', '7d', '30d', '1y', 'all'];
export const RANGE_LABELS = {
  '24h': '24 h',
  '7d': '7 days',
  '30d': '30 days',
  '1y': '1 year',
  all: 'All',
};

export function formatUsd(price) {
  if (typeof price !== 'number') return '—';
  const options =
    Math.abs(price) < 0.01
      ? { maximumSignificantDigits: 4, minimumSignificantDigits: 4 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...options }).format(
    price
  );
}

// change: a fraction (0.0441 → "+4.41 %"); null when there is no price a day earlier.
export function formatChange(change) {
  if (typeof change !== 'number') return '—';
  const percent = (change * 100).toFixed(2);
  return `${change > 0 ? '+' : change < 0 ? '−' : '±'}${percent.replace('-', '')} %`;
}

// The change's colour class (prices.css): up green, down red, none or flat plain.
export const changeClass = (change) =>
  `price-change${change > 0 ? ' price-change--up' : change < 0 ? ' price-change--down' : ''}`;

// A snapshot time in the viewer's zone, always with its date (a day's chart starts and ends at
// the same hour).
export function formatPriceTime(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}
