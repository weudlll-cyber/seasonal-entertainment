// ============================================================
// File:        EventsPage.jsx
// Path:        client/src/pages/EventsPage.jsx
// Project:     Seasonal Entertainment
// Description: /events: one week (Monday to Sunday in the viewer's time zone) of community
//              events, each at the viewer's local time with the zone named and the UTC time
//              beside it. Previous/next week buttons. timeZone and now are props so tests can
//              pin them; in the browser they come from the device.
// ============================================================

import { useEffect, useState } from 'react';
import {
  WEEKDAYS,
  formatDay,
  formatLocal,
  occurrencesInWeek,
  startOfWeek,
} from '@seasonal-entertainment/shared/eventSchedule.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import './EventsPage.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function EventsPage({ timeZone = deviceZone(), now }) {
  // "Now" is read once when the page opens; the week shown stays put while it is open.
  const [openedAt] = useState(() => now ?? Date.now());
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    api('/events')
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message));
  }, []);

  const weekStart = startOfWeek(openedAt, timeZone, weekOffset);
  const days = new Map();
  for (const occurrence of occurrencesInWeek(events ?? [], weekStart, timeZone)) {
    const day = formatDay(occurrence.start, timeZone);
    days.set(day, [...(days.get(day) ?? []), occurrence]);
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
      {events && days.size === 0 && <p>No events this week.</p>}
      {[...days].map(([day, occurrences]) => (
        <section key={day} className="event-day" aria-label={day}>
          <h3>{day}</h3>
          <ul className="event-list">
            {occurrences.map(({ event, start }) => {
              const local = formatLocal(start, timeZone);
              return (
                <li key={`${event.id}-${start}`} className="event">
                  <span className="event__time">
                    {local.time} <small>{local.zone}</small>
                  </span>
                  <span className="event__body">
                    <strong>{event.title}</strong> <small>({event.timeUtc} UTC)</small>
                    {event.rule === 'monthly_first' && (
                      <small> · first {WEEKDAYS[event.weekday - 1]} of each month</small>
                    )}
                    {event.channel && <span className="event__channel">{event.channel}</span>}
                    {event.description && <span>{event.description}</span>}
                    {event.link && (
                      <a href={event.link} target="_blank" rel="noopener noreferrer">
                        Open channel
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
