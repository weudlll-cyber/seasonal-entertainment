// ============================================================
// File:        CallEventItem.jsx
// Path:        client/src/pages/CallEventItem.jsx
// Project:     Seasonal Entertainment
// Description: One site call in the /events week (docs/CALLS.md, "In the event lists"), laid
//              out as the bot's entries (EventItem.jsx): the local time with its zone, the
//              call's title leading to its page, its date in the site's format (or "Live now"),
//              and the calls quarter as its picture.
// ============================================================

import { Link } from 'react-router';
import { formatLocal } from '@seasonal-entertainment/shared/localWeek.js';
import { formatWhen } from '../app/dates.js';
import { QUARTERS } from '../brand/brand.js';

// entry: one of callEntries()'s entries.
export default function CallEventItem({ entry: { id, name, start, live }, timeZone }) {
  const local = formatLocal(start, timeZone);
  return (
    <li className="event">
      <span className="event__time">
        {local.time} <small>{local.zone}</small>
      </span>
      <span className="event__body">
        <strong>
          <Link to={`/calls/${id}`}>{name}</Link>
        </strong>
        <span className="event__channel">
          {live ? 'Live now' : `Community call on this site, ${formatWhen(start, timeZone)}`}
        </span>
      </span>
      <img className="event__image" src={QUARTERS.calls} alt="" loading="lazy" />
    </li>
  );
}
