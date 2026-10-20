// ============================================================
// File:        EventItem.jsx
// Path:        client/src/pages/EventItem.jsx
// Project:     Seasonal Entertainment
// Description: One entry of the /events week: the local time with its zone, then the event —
//              a site event (title, UTC time, monthly note, channel, description, channel link)
//              or an event bot occurrence (docs/BOTS.md). Bot text is untrusted and rendered as
//              text only; its link is one only if the server passed it on (http or https); a
//              canceled occurrence is struck through and says "canceled".
// ============================================================

import { WEEKDAYS, formatLocal } from '@seasonal-entertainment/shared/eventSchedule.js';

const utcTime = (start) => new Date(start).toISOString().slice(11, 16);

// entry: one item of mergeWeek (eventWeek.js).
export default function EventItem({ entry, timeZone }) {
  const local = formatLocal(entry.start, timeZone);
  const canceled = entry.source === 'bot' && entry.occurrence.status === 'canceled';
  return (
    <li className={`event${canceled ? ' event--canceled' : ''}`}>
      <span className="event__time">
        {local.time} <small>{local.zone}</small>
      </span>
      {entry.source === 'site' ? <SiteEvent event={entry.event} /> : <BotEvent entry={entry} />}
    </li>
  );
}

function SiteEvent({ event }) {
  return (
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
  );
}

function BotEvent({ entry }) {
  const { name, status, platform, locationLabel, locationUrl, description } = entry.occurrence;
  const where = [platform, locationLabel].filter(Boolean).join(': ');
  return (
    <span className="event__body">
      <strong>{status === 'canceled' ? <del>{name}</del> : name}</strong>{' '}
      <small>({utcTime(entry.start)} UTC)</small>
      {status === 'canceled' && <span className="event__status">canceled</span>}
      {where && <span className="event__channel">{where}</span>}
      {description && <span>{description}</span>}
      {locationUrl && (
        <a href={locationUrl} target="_blank" rel="noopener noreferrer">
          Open {locationLabel || 'link'}
        </a>
      )}
    </span>
  );
}
