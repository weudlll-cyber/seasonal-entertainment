// ============================================================
// File:        senderLimit.js
// Path:        server/src/chat/senderLimit.js
// Project:     Seasonal Entertainment
// Description: Message rate limit per sender (account or guest), stricter for guests (decided
//              2026-10-17), built on one sliding-window counter. In memory: a restart forgets the
//              counts, which is fine for windows of seconds.
// ============================================================

// One sliding window: allow(key) is true (and counts) while key has fewer than max events in
// the last windowMs. max is a number or a function read at each call (a site setting). Also
// used for link-preview fetches (previews/service.js).
export function makeWindowLimit({ max, windowMs }) {
  const recent = new Map(); // key -> timestamps inside the window
  const maxNow = typeof max === 'function' ? max : () => max;
  return function allow(key, now = Date.now()) {
    const times = (recent.get(key) ?? []).filter((t) => t > now - windowMs);
    const allowed = times.length < maxNow();
    if (allowed) times.push(now);
    recent.set(key, times);
    // Keep memory flat: drop keys with nothing in their window.
    if (recent.size > 10_000) {
      for (const [k, list] of recent) if (!list.some((t) => t > now - windowMs)) recent.delete(k);
    }
    return allowed;
  };
}

// Members and guests have separate windows (guests stricter).
export function makeSenderLimit({ member, guest }) {
  const members = makeWindowLimit(member);
  const guests = makeWindowLimit(guest);
  // true = may send now (and the message is counted), false = too many.
  return (key, isGuest, now = Date.now()) => (isGuest ? guests : members)(key, now);
}
