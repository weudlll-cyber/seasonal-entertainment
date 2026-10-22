// ============================================================
// File:        EventItem.jsx
// Path:        client/src/pages/EventItem.jsx
// Project:     Seasonal Entertainment
// Description: One entry of the /events week: an occurrence from the event bot (docs/BOTS.md)
//              at the viewer's local time with its zone, the UTC time beside it, where it
//              happens, its description and link. Bot text is untrusted and rendered as text
//              only; the link is one only if the server passed it on (http or https); a
//              canceled occurrence is struck through and says "canceled". The event's image,
//              when the server has fetched one, comes from this site (/media), never from
//              elsewhere. With a site call linked to it (listen, docs/CALLS.md): "Listen on this
//              site" to the call's page, and "Live now" while that call is live.
// ============================================================

import { Link } from 'react-router';
import { formatLocal } from '@seasonal-entertainment/shared/localWeek.js';

const utcTime = (start) => new Date(start).toISOString().slice(11, 16);

// occurrence: one of /api/bot-events' occurrences.
export default function EventItem({ occurrence, timeZone }) {
  const { name, start, status, platform, locationLabel, locationUrl, description, image, listen } =
    occurrence;
  const local = formatLocal(start, timeZone);
  const canceled = status === 'canceled';
  const where = [platform, locationLabel].filter(Boolean).join(': ');
  return (
    <li className={`event${canceled ? ' event--canceled' : ''}`}>
      <span className="event__time">
        {local.time} <small>{local.zone}</small>
      </span>
      <span className="event__body">
        <strong>{canceled ? <del>{name}</del> : name}</strong> <small>({utcTime(start)} UTC)</small>
        {canceled && <span className="event__status">canceled</span>}
        {listen?.live && <span className="event__live">Live now</span>}
        {where && <span className="event__channel">{where}</span>}
        {description && <span>{description}</span>}
        {locationUrl && (
          <a href={locationUrl} target="_blank" rel="noopener noreferrer">
            Open {locationLabel || 'link'}
          </a>
        )}
        {listen && <Link to={`/calls/${listen.id}`}>Listen on this site</Link>}
      </span>
      {image && <img className="event__image" src={image} alt={name} loading="lazy" />}
    </li>
  );
}
