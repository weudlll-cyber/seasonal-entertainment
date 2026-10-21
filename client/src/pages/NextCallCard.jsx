// ============================================================
// File:        NextCallCard.jsx
// Path:        client/src/pages/NextCallCard.jsx
// Project:     Seasonal Entertainment
// Description: The home page's "Next call" box (docs/DESIGN.md, "Home"), with the play-button
//              quarter: from the same GET /api/calls answer as the Calls page — a live call
//              first ("Live now" and "Listen", guests too), else the next planned one (title,
//              local date and time, its page, "Add to calendar" and the member's reminder:
//              CallActions.jsx), else one friendly line and the way to the Calls page.
// ============================================================

import { Link } from 'react-router';
import { formatDay, formatLocal } from '@seasonal-entertainment/shared/localWeek.js';
import { QUARTERS } from '../brand/brand.js';
import CallActions from '../calls/CallActions.jsx';
import { Wash } from './homeCards.jsx';

// As "Up next" writes a time: "Thursday 22 October, 20:30 CEST" (shared/localWeek.js).
function when(iso, timeZone) {
  const local = formatLocal(Date.parse(iso), timeZone);
  return `${formatDay(Date.parse(iso), timeZone)}, ${local.time} ${local.zone}`;
}

// calls: the /api/calls answer ({ configured, calls, reminders }), or null while loading or
// failed. Nothing at all while calls are not set up. timeZone: the viewer's (LandingPage).
export default function NextCallCard({ calls, timeZone }) {
  if (!calls?.configured) return null;
  const live = calls.calls.live[0];
  const next = calls.calls.upcoming[0];
  return (
    <section className="card home__card home__next-call" aria-label="Next call">
      <Wash src={QUARTERS.calls} />
      <p className="home__eyebrow">{live ? 'Live now' : 'Next call'}</p>
      {live && (
        <>
          <h2 className="home__call-title">{live.title}</h2>
          <p className="home__actions">
            <Link
              className="button"
              to={`/calls/${live.id}`}
              aria-label={`Listen to ${live.title}`}
            >
              Listen
            </Link>
          </p>
        </>
      )}
      {!live && next && (
        <>
          <h2 className="home__call-title">
            <Link to={`/calls/${next.id}`}>{next.title}</Link>
          </h2>
          <p className="home__text">
            {next.scheduledFor ? when(next.scheduledFor, timeZone) : 'The time is not set yet.'}
          </p>
          <CallActions call={next} reminded={calls.reminders?.includes(next.id)} compact />
        </>
      )}
      {!live && !next && (
        <>
          <p className="home__text">No call is planned yet. Organisers announce them here.</p>
          <p>
            <Link to="/calls">All calls</Link>
          </p>
        </>
      )}
    </section>
  );
}
