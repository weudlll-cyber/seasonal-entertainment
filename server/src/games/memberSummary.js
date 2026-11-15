// ============================================================
// File:        memberSummary.js
// Path:        server/src/games/memberSummary.js
// Project:     Seasonal Entertainment
// Description: A member's results from the embedded games, for their profile (docs/GAME-
//              INTEGRATION.md, "A member's results on their profile"; decided 2026-11-14). The
//              site asks each switched-on game that has a local origin (GAMES_LOCAL_ORIGINS,
//              embedded.js) for one member's summary by website user id, server to server,
//              with the games' sync token (the account-changes feed's, one for all games), and
//              checks the answer against the contract (parseSummary): at most four values a
//              game names itself, the last time played. Short timeout, small answers, no
//              redirects; answers are kept a few minutes. Anything wrong (refused, slow, too
//              large, not the contract) only leaves that game's card out: a profile never waits
//              for, or breaks on, a game.
// ============================================================

import { EMBEDDED_GAMES } from './embedded.js';

export const SUMMARY_PATH = (slug) => `/games/${slug}/api/website/member-summary`;
export const LIMITS = { values: 4, label: 24, value: 16, bytes: 4096, timeoutMs: 1500 };
// A real answer (a card or "no data") is kept 5 minutes; a failure 1, so a game that comes
// back shows soon without being asked on every profile view.
export const CACHE_MS = { answer: 5 * 60_000, failure: 60_000 };
const CACHE_MAX = 5000;

// Printable text without control characters, trimmed, 1 to max characters; else null.
function text(value, max) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  // eslint-disable-next-line no-control-regex -- control characters are what is refused here
  if (!clean || [...clean].length > max || /[\u0000-\u001f\u007f]/.test(clean)) return null;
  return clean;
}

// A value: such text, or a whole number from 0 to 999 999 999 (shown as the game sent it).
function shownValue(value) {
  if (Number.isInteger(value) && value >= 0 && value < 1e9) return String(value);
  return text(value, LIMITS.value);
}

// The contract's answer body (parsed JSON) -> { values, lastPlayedAt } for a card, null for
// "no data"; throws on anything else (the caller leaves the card out).
export function parseSummary(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  if (body.noData === true) return null;
  const { values, lastPlayedAt = null } = body;
  if (!Array.isArray(values) || values.length < 1 || values.length > LIMITS.values) {
    throw new Error('values: 1 to 4 expected');
  }
  const shown = values.map((item) => {
    const label = text(item?.label, LIMITS.label);
    const value = shownValue(item?.value);
    if (!label || value === null) throw new Error('a value is not label + value within limits');
    return { label, value };
  });
  if (lastPlayedAt !== null) {
    const at = typeof lastPlayedAt === 'string' ? Date.parse(lastPlayedAt) : NaN;
    if (Number.isNaN(at)) throw new Error('lastPlayedAt is not a time');
    return { values: shown, lastPlayedAt: new Date(at).toISOString() };
  }
  return { values: shown, lastPlayedAt: null };
}

// One game's answer for one member: a card's data, null (no data), or throws.
async function askGame(origin, slug, userId, token, fetchImpl) {
  const url = `${origin}${SUMMARY_PATH(slug)}?user=${encodeURIComponent(userId)}`;
  const res = await fetchImpl(url, {
    headers: { 'X-Games-Sync-Token': token, Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(LIMITS.timeoutMs),
  });
  if (res.status === 404) return null; // the game knows no such player: "no data" too
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const raw = await res.text();
  if (Buffer.byteLength(raw) > LIMITS.bytes) throw new Error('answer too large');
  return parseSummary(JSON.parse(raw));
}

// games: config.games ({ embedded, syncToken, localOrigins }); fetchImpl and now for tests.
// cardsFor(userId) resolves to the cards in the allowlist's order:
// [{ slug, name, path, values, lastPlayedAt }]; it never rejects.
export function createGameResults(games, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(); // `${slug}:${userId}` -> { until, card }
  const asked = games.syncToken
    ? games.embedded.filter((slug) => Object.hasOwn(games.localOrigins ?? {}, slug))
    : [];

  async function cardOf(slug, userId) {
    const key = `${slug}:${userId}`;
    const kept = cache.get(key);
    if (kept && kept.until > now()) return kept.card;
    let card = null;
    let keepFor = CACHE_MS.answer;
    try {
      const summary = await askGame(
        games.localOrigins[slug],
        slug,
        userId,
        games.syncToken,
        fetchImpl
      );
      if (summary)
        card = { slug, name: EMBEDDED_GAMES[slug].name, path: `/games/${slug}`, ...summary };
    } catch {
      // Refused, slow, too large or not the contract: no card, and asked again sooner.
      keepFor = CACHE_MS.failure;
    }
    // Expired entries go once the cache is large, so it never grows without bound.
    if (cache.size >= CACHE_MAX) {
      for (const [old, entry] of cache) if (entry.until <= now()) cache.delete(old);
    }
    cache.set(key, { until: now() + keepFor, card });
    return card;
  }

  return {
    // Every game at once: the slowest decides, and its timeout bounds that.
    cardsFor: async (userId) =>
      (await Promise.all(asked.map((slug) => cardOf(slug, userId)))).filter(Boolean),
  };
}
