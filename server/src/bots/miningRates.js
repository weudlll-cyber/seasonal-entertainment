// ============================================================
// File:        miningRates.js
// Path:        server/src/bots/miningRates.js
// Project:     Seasonal Entertainment
// Description: The price bot's mining rates (mining_rates.json in its runtime folder, next to
//              snapshots.db; docs/BOTS.md): how many tokens of each season are mined per hour.
//              Read-only, as the bot's own load_mine_rates (helpers/fair_prices.py) reads them:
//              season names in any case, numbers as given; every season must be there with a
//              rate above 0, else the rates count as not available.
// ============================================================

import { readFileSync } from 'node:fs';
import { PRICE_TOKENS } from './prices.js';

// { spring, summer, autumn, winter } (tokens per hour), or throws with the reason.
export function readMiningRates(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const rates = Object.fromEntries(
    Object.entries(data).map(([name, rate]) => [name.toLowerCase(), Number(rate)])
  );
  const missing = PRICE_TOKENS.filter((t) => !(t in rates));
  if (missing.length) throw new Error(`mining rates missing for ${missing.join(', ')}`);
  const invalid = PRICE_TOKENS.filter((t) => !(rates[t] > 0));
  if (invalid.length) throw new Error(`mining rates must be above 0: ${invalid.join(', ')}`);
  return Object.fromEntries(PRICE_TOKENS.map((t) => [t, rates[t]]));
}
