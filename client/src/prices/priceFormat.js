// ============================================================
// File:        priceFormat.js
// Path:        client/src/prices/priceFormat.js
// Project:     Seasonal Entertainment
// Description: The price data's shared pieces on the client (docs/BOTS.md): the four tokens,
//              the reference coins and the chart ranges as the server names them, and the
//              formats: one rule for every coin's US-dollar price (at least four significant
//              digits below $1, so the seasons' fractions of a cent and POL's cents stay
//              readable; two decimals from $1 on); the 24-hour change as a signed percentage
//              (shared/priceChange.js, which the weekly recap uses too).
//              Times use the site's one date format (app/dates.js).
// ============================================================

// Calendar order, as on the home page; `id` is the bot's token name and the colour token.
export const TOKENS = [
  { id: 'spring', name: 'Spring' },
  { id: 'summer', name: 'Summer' },
  { id: 'autumn', name: 'Autumn' },
  { id: 'winter', name: 'Winter' },
];
// The reference row (ETH, POL and BTC, from CoinGecko through this server; docs/BOTS.md).
export const REFERENCE = [
  { id: 'eth', name: 'ETH' },
  { id: 'pol', name: 'POL' },
  { id: 'btc', name: 'BTC' },
];
export const RANGES = ['24h', '7d', '30d', '1y', 'all'];
export const RANGE_LABELS = {
  '24h': '24 h',
  '7d': '7 days',
  '30d': '30 days',
  '1y': '1 year',
  all: 'All',
};

// Every coin's price, wherever the prices page shows one (cards, chart axis, read-out,
// converter): below $1 four significant digits ($0.002712, $0.09420), from $1 on cents.
export function formatUsd(price) {
  if (typeof price !== 'number') return '—';
  const options =
    Math.abs(price) < 1
      ? { maximumSignificantDigits: 4, minimumSignificantDigits: 4 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...options }).format(
    price
  );
}

// "+4.41 %" from 0.0441; one rule with the weekly recap's (shared/priceChange.js).
export { formatChange } from '@seasonal-entertainment/shared/priceChange.js';

// The change's colour class (prices.css): up green, down red, none or flat plain.
export const changeClass = (change) =>
  `price-change${change > 0 ? ' price-change--up' : change < 0 ? ' price-change--down' : ''}`;
