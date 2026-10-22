// ============================================================
// File:        callEntries.js
// Path:        client/src/calls/callEntries.js
// Project:     Seasonal Entertainment
// Description: The site's live and planned calls in the event lists (home "Up next", /events;
//              docs/CALLS.md, "In the event lists"), from the useCalls answer. withCalls()
//              merges them with the event bot's occurrences by start time. A call linked to an
//              occurrence that is in the list (same id and start; docs/CALLS.md, "Linked to a
//              bot event") is not listed a second time: the occurrence carries it instead
//              (listen: { id, live }, "Listen on this site"). Nothing while calls are not set up.
// ============================================================

// The live and planned calls as dated entries: { call: true, id, name, start, live, event }.
function callEntries(calls) {
  if (!calls?.configured) return [];
  const entry = (call, start, live) => ({
    call: true,
    id: call.id,
    name: call.title,
    start,
    live,
    event: call.botOccurrenceId
      ? { id: call.botOccurrenceId, start: call.botOccurrenceStart }
      : null,
  });
  const live = calls.calls.live.map((c) => entry(c, Date.parse(c.startedAt), true));
  // A planned call without a time has no place in a list ordered by time (the Next call box
  // and the Calls page still show it).
  const planned = calls.calls.upcoming
    .filter((c) => c.scheduledFor)
    .map((c) => entry(c, Date.parse(c.scheduledFor), false));
  return [...live, ...planned];
}

// occurrences: the bot's, as shown; calls: the /api/calls answer or null; only unlinked calls
// starting in [from, to) (milliseconds) are added. Returns all of them, soonest first.
export function withCalls(occurrences, calls, { from = -Infinity, to }) {
  const linked = new Map(); // occurrence -> its call entry
  const own = [];
  for (const entry of callEntries(calls)) {
    // Matched by id and start: an occurrence that moved has lost its call (the call keeps its
    // own time and is listed as itself).
    const occurrence =
      entry.event &&
      occurrences.find((o) => o.id === entry.event.id && o.start === entry.event.start);
    if (occurrence && !linked.has(occurrence)) linked.set(occurrence, entry);
    else if (entry.start >= from && entry.start < to) own.push(entry);
  }
  const listed = occurrences.map((o) =>
    linked.has(o) ? { ...o, listen: { id: linked.get(o).id, live: linked.get(o).live } } : o
  );
  return [...listed, ...own].sort((a, b) => a.start - b.start);
}
