// ============================================================
// File:        coinSelection.js
// Path:        client/src/prices/coinSelection.js
// Project:     Seasonal Entertainment
// Description: Which coins the chart of /info/prices shows (docs/BOTS.md): read from and written
//              to the page address (?coins=spring,eth), toggled by the coin buttons with at least
//              one always left, and "All" with its way back to the single coin shown before.
//              Coins without a price (a source not connected) are never shown.
// ============================================================

import { REFERENCE, TOKENS } from './priceFormat.js';

// Every coin, in the order of the buttons: the seasons, then the reference coins.
export const ALL_COINS = [...TOKENS, ...REFERENCE].map((t) => t.id);
const FALLBACK = 'spring';
const ordered = (ids) => ALL_COINS.filter((id) => ids.includes(id));

// The ?coins= value as known coins, in button order; nothing valid: Spring.
export function parseCoins(value) {
  const ids = ordered((value ?? '').split(',').map((v) => v.trim().toLowerCase()));
  return ids.length ? ids : [FALLBACK];
}

// The requested coins that can be shown now; none of them: Spring, else the first available.
export function shownCoins(requested, available) {
  const shown = requested.filter((id) => available.includes(id));
  if (shown.length) return shown;
  return available.includes(FALLBACK) ? [FALLBACK] : available.slice(0, 1);
}

// A coin button: shown coins go, others come; the last one shown stays.
export function toggleCoin(selected, id) {
  if (!selected.includes(id)) return ordered([...selected, id]);
  return selected.length > 1 ? selected.filter((s) => s !== id) : selected;
}

// "All": every available coin; when all are shown already, back to `single` (the coin shown on
// its own before), or the first available one if that is gone.
export function toggleAll(selected, available, single) {
  if (!available.every((id) => selected.includes(id))) return available;
  return [available.includes(single) ? single : available[0]];
}
