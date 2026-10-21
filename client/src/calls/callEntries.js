// ============================================================
// File:        callEntries.js
// Path:        client/src/calls/callEntries.js
// Project:     Seasonal Entertainment
// Description: The site's live and planned calls as entries of the event lists (home "Up
//              next", /events; docs/CALLS.md, "In the event lists"), from the useCalls answer:
//              { call: true, id, name, start, live }, to be merged with the event bot's
//              occurrences and sorted by start (byStart). Nothing while calls are not set up.
// ============================================================

// calls: the /api/calls answer or null; only entries starting in [from, to) (milliseconds).
export function callEntries(calls, { from = -Infinity, to }) {
  if (!calls?.configured) return [];
  const entry = (call, start, live) => ({ call: true, id: call.id, name: call.title, start, live });
  const live = calls.calls.live.map((c) => entry(c, Date.parse(c.startedAt), true));
  // A planned call without a time has no place in a list ordered by time (the Next call box
  // and the Calls page still show it).
  const planned = calls.calls.upcoming
    .filter((c) => c.scheduledFor)
    .map((c) => entry(c, Date.parse(c.scheduledFor), false));
  return [...live, ...planned].filter((e) => e.start >= from && e.start < to);
}

export const byStart = (a, b) => a.start - b.start;
