// ============================================================
// File:        CallCard.jsx
// Path:        client/src/calls/CallCard.jsx
// Project:     Seasonal Entertainment
// Description: One call in the /calls list: title, LIVE mark, when (planned, started or
//              ended, in the viewer's time zone), description, who created it, a link to
//              the call's page (dates in the site's one format, app/dates.js); for a planned call "Add to calendar" and the member's reminder
//              (CallActions.jsx); for organisers and admins the Start / End button its status
//              allows and, on a planned call, its event bot occurrence (EventSelect.jsx). A call
//              whose recording runs says "Being recorded".
// ============================================================

import { Link } from 'react-router';
import { formatWhen } from '../app/dates.js';
import CallActions from './CallActions.jsx';
import EventSelect from './EventSelect.jsx';
import LiveBadge from './LiveBadge.jsx';

function timeLine(call) {
  if (call.status === 'live') return `Started ${formatWhen(call.startedAt)}`;
  if (call.status === 'ended') return `Ended ${formatWhen(call.endedAt)}`;
  return call.scheduledFor ? `Planned for ${formatWhen(call.scheduledFor)}` : 'Not planned yet';
}

// reminded: this member has a reminder for it; onAction(call, 'start' | 'end') and
// onLink(call, occurrenceId | null): only passed to organisers and admins, with events (the
// bot's upcoming occurrences).
export default function CallCard({ call, reminded, onAction, onLink, events }) {
  return (
    <li className={`call-card call-card--${call.status}`}>
      <h3 className="call-card__title">
        {call.title}
        {call.status === 'live' && <LiveBadge />}
      </h3>
      {call.recording && <p className="call-card__recording">Being recorded</p>}
      <p className="call-card__time">{timeLine(call)}</p>
      {call.description && <p>{call.description}</p>}
      {call.createdBy && <p className="call-card__by">Created by {call.createdBy}</p>}
      <p>
        <Link to={`/calls/${call.id}`} className={call.status === 'live' ? 'button' : undefined}>
          {call.status === 'live' ? `Open ${call.title}` : `Details of ${call.title}`}
        </Link>
      </p>
      <CallActions call={call} reminded={reminded} />
      {onLink && call.status === 'scheduled' && (
        <EventSelect
          label={`Event of ${call.title}`}
          // An occurrence no longer in the bot's list shows as "No event".
          value={events.some((o) => o.id === call.botOccurrenceId) ? call.botOccurrenceId : null}
          onChange={(id) => onLink(call, id)}
          occurrences={events}
        />
      )}
      {onAction && call.status !== 'ended' && (
        <div className="call-card__actions">
          {call.status === 'scheduled' && (
            <button className="button" type="button" onClick={() => onAction(call, 'start')}>
              Start {call.title}
            </button>
          )}
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onAction(call, 'end')}
          >
            {call.status === 'live' ? `End ${call.title} for everyone` : `Cancel ${call.title}`}
          </button>
        </div>
      )}
    </li>
  );
}
