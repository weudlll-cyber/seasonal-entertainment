// ============================================================
// File:        seasonClock.js
// Path:        shared/seasonClock.js
// Project:     Seasonal Entertainment
// Description: The season clock (docs/DESIGN.md, "Home"), from the token contracts' own halving
//              schedule (github.com/seasonaltokens/seasonaltokens, contracts/*Token.sol):
//              reward = INITIAL_REWARD / 2^era, era 0 until DURATION_OF_FIRST_ERA after the
//              contract's creation, then one more every DURATION_OF_ERA (3 x 365 days).
//              Copied from the source:
//                SpringToken.sol:48 INITIAL_REWARD 168, :54 DURATION_OF_FIRST_ERA 3/4 year,
//                  :56 DURATION_OF_ERA 3 years, :242-249 rewardEra, :278 the reward;
//                SummerToken.sol:47 INITIAL_REWARD 140, :53 DURATION_OF_FIRST_ERA 3/2 years;
//                AutumnToken.sol:47 INITIAL_REWARD 120, :53 DURATION_OF_FIRST_ERA 9/4 years;
//                WinterToken.sol:47 INITIAL_REWARD 105, :53 DURATION_OF_FIRST_ERA 3 years.
//              Every contract's total supply is 33,112,800 tokens (SpringToken.sol:22, :46).
//              contractCreationTime (SpringToken.sol:62, set at :83): read 2026-10-23 from each
//              contract with a read-only eth_call through a public Ethereum JSON-RPC endpoint
//              (no key; the addresses taken from the official site at that moment, stored
//              nowhere). "In season" is the token with the highest current reward, the
//              official "produced at the fastest rate". Pure functions; times in Unix seconds.
// ============================================================

const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY; // the contracts' year: 365 days, no leap days
export const DURATION_OF_ERA = 3 * YEAR;

// In the contracts' order of the seasons.
export const SEASON_CONTRACTS = [
  { token: 'spring', created: 1630837674, firstEra: (YEAR * 3) / 4, initialReward: 168 },
  { token: 'summer', created: 1630837937, firstEra: (YEAR * 3) / 2, initialReward: 140 },
  { token: 'autumn', created: 1630837847, firstEra: (YEAR * 9) / 4, initialReward: 120 },
  { token: 'winter', created: 1630838070, firstEra: 3 * YEAR, initialReward: 105 },
];

// The contract's rewardEra(time): 0 in the first era, then 1, 2, ... every three years.
export function rewardEra({ created, firstEra }, time) {
  const since = time - created;
  return since < firstEra ? 0 : 1 + Math.floor((since - firstEra) / DURATION_OF_ERA);
}

export const rewardAt = (contract, time) => contract.initialReward / 2 ** rewardEra(contract, time);

// When era `era` (1, 2, ...) begins: that halving, in Unix seconds.
const halvingInto = ({ created, firstEra }, era) =>
  created + firstEra + (era - 1) * DURATION_OF_ERA;

// The first halving after `time`.
const nextHalvingOf = (contract, time) => halvingInto(contract, rewardEra(contract, time) + 1);

// The halvings up to `until`, oldest first: { token, at }.
export function halvingsUntil(until) {
  return SEASON_CONTRACTS.flatMap((contract) => {
    const list = [];
    for (let era = 1; halvingInto(contract, era) <= until; era += 1) {
      list.push({ token: contract.token, at: halvingInto(contract, era) });
    }
    return list;
  }).sort((a, b) => a.at - b.at);
}

// At `time`: the token in season (highest reward) and the next halving of any token.
export function seasonClock(time) {
  const inSeason = SEASON_CONTRACTS.reduce((best, c) =>
    rewardAt(c, time) > rewardAt(best, time) ? c : best
  ).token;
  const next = SEASON_CONTRACTS.map((c) => ({ token: c.token, at: nextHalvingOf(c, time) })).sort(
    (a, b) => a.at - b.at
  )[0];
  return { inSeason, next };
}
