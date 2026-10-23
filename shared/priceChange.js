// ============================================================
// File:        priceChange.js
// Path:        shared/priceChange.js
// Project:     Seasonal Entertainment
// Description: How a price change reads, the same on the price tiles and the chart (client,
//              via client/src/prices/priceFormat.js) and in the weekly recap (server, recap/):
//              a signed percentage with two decimals, "—" when there is none.
// ============================================================

// change: a fraction (0.0441 → "+4.41 %"); null when there is no earlier price.
export function formatChange(change) {
  if (typeof change !== 'number') return '—';
  const percent = (change * 100).toFixed(2);
  return `${change > 0 ? '+' : change < 0 ? '−' : '±'}${percent.replace('-', '')} %`;
}
