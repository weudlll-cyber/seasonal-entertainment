// ============================================================
// File:        EventsPage.jsx
// Path:        client/src/pages/EventsPage.jsx
// Project:     Seasonal Entertainment
// Description: /events: one week (Monday to Sunday in the viewer's time zone) of community
//              events, each at the viewer's local time with the zone named and the UTC time
//              beside it: the site's own events and the event bot's occurrences of that week
//              (eventWeek.js, EventItem.jsx; docs/BOTS.md). Previous/next week buttons.
//              timeZone and now are props so tests can pin them; in the browser they come
//              from the device.
// ============================================================

import { useEffect, useState } from 'react';
import {
  formatDay,
  occurrencesInWeek,
  startOfWeek,
} from '@seasonal-entertainment/shared/eventSchedule.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import EventItem from './EventItem.jsx';
import { mergeWeek } from './eventWeek.js';
import './EventsPage.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function EventsPage({ timeZone = deviceZone(), now }) {
  // "Now" is read once when the page opens; the week shown stays put while it is open.
  const [openedAt] = useState(() => now ?? Date.now());
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  // The bot's answer, tagged with the week it is for: { from, connected, occurrences } or
  // { from, failed: true }.
  const [bot, setBot] = useState(null);

  useEffect(() => {
    api('/events')
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message));
  }, []);

  const weekStart = startOfWeek(openedAt, timeZone, weekOffset);
  // The next Monday, not +7 days: a week with a daylight-saving change is an hour off.
  const weekEnd = startOfWeek(openedAt, timeZone, weekOffset + 1);

  useEffect(() => {
    api(`/bot-events?from=${weekStart}&to=${weekEnd}`)
      .then((data) => setBot({ from: weekStart, ...data }))
      .catch(() => setBot({ from: weekStart, failed: true }));
  }, [weekStart, weekEnd]);

  const botWeek = bot?.from === weekStart ? bot : null; // an earlier week's answer is not shown
  const entries = mergeWeek(
    occurrencesInWeek(events ?? [], weekStart, timeZone),
    botWeek?.occurrences ?? []
  );
  const days = new Map();
  for (const entry of entries) {
    const day = formatDay(entry.start, timeZone);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }

  return (
    <section className="page">
      <h1>Events</h1>
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
      <FormMessage error={error} />
      {botWeek?.connected === false && (
        <p role="status">
          The event bot's calendar is not connected; only the site's own events are shown.
        </p>
      )}
      {botWeek?.failed && <p role="status">The event bot's calendar cannot be read right now.</p>}
      {events && days.size === 0 && <p>No events this week.</p>}
      {[...days].map(([day, list]) => (
        <section key={day} className="event-day" aria-label={day}>
          <h3>{day}</h3>
          <ul className="event-list">
            {list.map((entry) => (
              <EventItem
                key={`${entry.source}-${entry.source === 'site' ? entry.event.id : entry.occurrence.id}-${entry.start}`}
                entry={entry}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
