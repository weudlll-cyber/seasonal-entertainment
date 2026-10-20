// ============================================================
// File:        EventsPage.jsx
// Path:        client/src/pages/EventsPage.jsx
// Project:     Seasonal Entertainment
// Description: /events: one week (Monday to Sunday in the viewer's time zone) of the event
//              bot's occurrences (docs/BOTS.md), each at the viewer's local time with the zone
//              named and the UTC time beside it (EventItem.jsx). Previous/next week buttons.
//              Without the event bot the page says so plainly. timeZone and now are props so
//              tests can pin them; in the browser they come from the device. SE style: the
//              Events header with the balls quarter; each event's bar takes a season colour.
// ============================================================

import { useEffect, useState } from 'react';
import { formatDay, startOfWeek } from '@seasonal-entertainment/shared/localWeek.js';
import { api } from '../api/http.js';
import PageHeader from '../brand/PageHeader.jsx';
import EventItem from './EventItem.jsx';
import './EventsPage.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function EventsPage({ timeZone = deviceZone(), now }) {
  // "Now" is read once when the page opens; the week shown stays put while it is open.
  const [openedAt] = useState(() => now ?? Date.now());
  const [weekOffset, setWeekOffset] = useState(0);
  // The bot's answer, tagged with the week it is for: { from, connected, occurrences } or
  // { from, failed: true }.
  const [bot, setBot] = useState(null);

  const weekStart = startOfWeek(openedAt, timeZone, weekOffset);
  // The next Monday, not +7 days: a week with a daylight-saving change is an hour off.
  const weekEnd = startOfWeek(openedAt, timeZone, weekOffset + 1);

  useEffect(() => {
    api(`/bot-events?from=${weekStart}&to=${weekEnd}`)
      .then((data) => setBot({ from: weekStart, ...data }))
      .catch(() => setBot({ from: weekStart, failed: true }));
  }, [weekStart, weekEnd]);

  const week = bot?.from === weekStart ? bot : null; // an earlier week's answer is not shown
  const days = new Map();
  for (const occurrence of week?.occurrences ?? []) {
    const day = formatDay(occurrence.start, timeZone);
    days.set(day, [...(days.get(day) ?? []), occurrence]);
  }

  return (
    <section className="page">
      <PageHeader
        quarter="events"
        title="Events"
        lead="Mind games, battles and contests of the community."
      />
      <p>
        Times are shown in your time zone (<strong>{timeZone}</strong>); UTC in brackets.
      </p>
      <div className="week-nav">
        <button className="button" type="button" onClick={() => setWeekOffset(weekOffset - 1)}>
          ← Previous week
        </button>
        <h2>Week of {formatDay(weekStart, timeZone)}</h2>
        <button className="button" type="button" onClick={() => setWeekOffset(weekOffset + 1)}>
          Next week →
        </button>
      </div>
      {week?.connected === false && (
        <p role="status">The event calendar is not connected, so there are no events to show.</p>
      )}
      {week?.failed && <p role="status">The event calendar cannot be read right now.</p>}
      {week?.connected && days.size === 0 && <p>No events this week.</p>}
      {[...days].map(([day, list]) => (
        <section key={day} className="event-day" aria-label={day}>
          <h3>{day}</h3>
          <ul className="event-list">
            {list.map((occurrence) => (
              <EventItem
                key={`${occurrence.id}-${occurrence.start}`}
                occurrence={occurrence}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
