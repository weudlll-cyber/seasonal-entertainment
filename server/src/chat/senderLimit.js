// ============================================================
// File:        senderLimit.js
// Path:        server/src/chat/senderLimit.js
// Project:     Seasonal Entertainment
// Description: Message rate limit per sender (account or guest), stricter for guests
//              (decided 2026-10-17). In memory: a restart forgets the counts, which is fine
//              for windows of seconds.
// ============================================================

export function makeSenderLimit({ member, guest }) {
  const recent = new Map(); // sender key -> timestamps inside the window

  // true = may send now (and the message is counted), false = too many.
  return function allowMessage(key, isGuest, now = Date.now()) {
    const { max, windowMs } = isGuest ? guest : member;
    const times = (recent.get(key) ?? []).filter((t) => t > now - windowMs);
    const allowed = times.length < max;
    if (allowed) times.push(now);
    recent.set(key, times);
    // Keep memory flat: drop senders with nothing in their window.
    if (recent.size > 10_000) {
      for (const [k, list] of recent) if (!list.some((t) => t > now - windowMs)) recent.delete(k);
    }
    return allowed;
  };
}
