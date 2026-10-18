// ============================================================
// File:        CallCard.jsx
// Path:        client/src/calls/CallCard.jsx
// Project:     Seasonal Entertainment
// Description: One call in the /calls list: title, LIVE mark, when (planned, started or
//              ended, in the browser's local time), description, who created it; for
//              organisers and admins the Start / End button its status allows.
// ============================================================

import LiveBadge from './LiveBadge.jsx';

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function timeLine(call) {
  if (call.status === 'live') return `Started ${when(call.startedAt)}`;
  if (call.status === 'ended') return `Ended ${when(call.endedAt)}`;
  return call.scheduledFor ? `Planned for ${when(call.scheduledFor)}` : 'Not planned yet';
}

// onAction(call, 'start' | 'end'): only passed to organisers and admins.
export default function CallCard({ call, onAction }) {
  return (
    <li className={`call-card call-card--${call.status}`}>
      <h3 className="call-card__title">
        {call.title}
        {call.status === 'live' && <LiveBadge />}
      </h3>
      <p className="call-card__time">{timeLine(call)}</p>
      {call.description && <p>{call.description}</p>}
      {call.createdBy && <p className="call-card__by">Created by {call.createdBy}</p>}
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
