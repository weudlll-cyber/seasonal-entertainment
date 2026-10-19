// ============================================================
// File:        eventWeek.js
// Path:        client/src/pages/eventWeek.js
// Project:     Seasonal Entertainment
// Description: One week of /events from two sources: the site's own events (their rules turned
//              into starts by shared/eventSchedule.js) and the event bot's occurrences (read by
//              the server, docs/BOTS.md). One list, soonest first. An event in both — the same
//              name (trimmed, any case) at the same start minute — is shown once, the bot's
//              version (decided 2026-10-20).
// ============================================================

const sameEvent = (name, start) => `${name.trim().toLowerCase()}|${Math.floor(start / 60_000)}`;

// site: [{ event, start }]; bot: the bot's occurrences ({ name, start, ... }).
// Returns [{ source: 'site', start, event } | { source: 'bot', start, occurrence }].
export function mergeWeek(site, bot) {
  const fromBot = new Set(bot.map((o) => sameEvent(o.name, o.start)));
  return [
    ...site
      .filter(({ event, start }) => !fromBot.has(sameEvent(event.title, start)))
      .map(({ event, start }) => ({ source: 'site', start, event })),
    ...bot.map((occurrence) => ({ source: 'bot', start: occurrence.start, occurrence })),
  ].sort((a, b) => a.start - b.start);
}
