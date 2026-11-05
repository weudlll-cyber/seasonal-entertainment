// ============================================================
// File:        openRoundsContract.js
// Path:        server/src/games/openRoundsContract.js
// Project:     Seasonal Entertainment
// Description: The shared contract of a game's sign-up status (docs/OPEN-ROUNDS.md), checked
//              strictly: an answer that is not the contract's page at all fails (the poller then
//              keeps its last good one, openRounds.js); a page of a higher "version" is ignored as
//              a whole (no rounds); every round that breaks a rule is dropped alone, never the
//              page; a joinUrl off the status URL's origin is dropped too; at most 20 rounds; a
//              round whose sign-up has closed by now is left out. Unknown fields are ignored and
//              never passed on.
// ============================================================

export const CONTRACT_VERSION = 1;
export const MAX_ROUNDS = 20;

export class StatusInvalid extends Error {}

const text = (v, max, { empty = false } = {}) =>
  typeof v === 'string' && v.length <= max && (empty || v.trim() !== '');
// ISO 8601 in UTC ("…Z"), or null.
const utcOrNull = (v) =>
  v === null || (typeof v === 'string' && /Z$/.test(v) && !Number.isNaN(Date.parse(v)));
const count = (v, min) => Number.isInteger(v) && v >= min;

// The round as the site keeps it, or null when it breaks a rule. origin: the status URL's.
function checkRound(round, origin, now) {
  if (!round || typeof round !== 'object') return null;
  const { id, title, kind, startsAt, signupClosesAt, players, maxPlayers, joinUrl } = round;
  if (!text(id, 64) || !text(title, 80) || !text(kind, 40, { empty: true })) return null;
  if (!utcOrNull(startsAt) || !utcOrNull(signupClosesAt)) return null;
  if (!count(players, 0) || !(maxPlayers === null || count(maxPlayers, 1))) return null;
  let join;
  try {
    join = new URL(joinUrl);
  } catch {
    return null;
  }
  if (join.protocol !== 'https:' || join.origin !== origin) return null;
  if (signupClosesAt && Date.parse(signupClosesAt) <= now) return null;
  return { id, title, kind, startsAt, signupClosesAt, players, maxPlayers, joinUrl: join.href };
}

// Soonest start first (no start last), then by title.
export function byStart(a, b) {
  const at = (r) => (r.startsAt ? Date.parse(r.startsAt) : Infinity);
  return at(a) - at(b) || a.title.localeCompare(b.title);
}

// body: the answer's text; statusUrl: where it came from. Returns the open rounds (sorted, at
// most MAX_ROUNDS); throws StatusInvalid when the answer is not the contract's page at all.
export function parseOpenRounds(body, statusUrl, now = Date.now()) {
  let page;
  try {
    page = JSON.parse(body);
  } catch {
    throw new StatusInvalid('not JSON');
  }
  if (!page || typeof page !== 'object' || !Number.isInteger(page.version)) {
    throw new StatusInvalid('no version');
  }
  // A newer contract than this site knows: ignored as a whole until supported.
  if (page.version > CONTRACT_VERSION) return [];
  if (page.version !== CONTRACT_VERSION || !Array.isArray(page.rounds)) {
    throw new StatusInvalid('not the contract');
  }
  const origin = new URL(statusUrl).origin;
  return page.rounds
    .slice(0, MAX_ROUNDS)
    .map((round) => checkRound(round, origin, now))
    .filter(Boolean)
    .sort(byStart);
}
