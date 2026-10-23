// ============================================================
// File:        CallNotices.jsx
// Path:        client/src/calls/CallNotices.jsx
// Project:     Seasonal Entertainment
// Description: The notices of "Remind me on this site" (docs/CALLS.md, "Reminders"): "<title>
//              starts in N minutes" (counted to its planned start; the lead time is a site
//              setting) and "<title> is live now", each with "Listen" and
//              "Dismiss", on every open page of the member. The server pushes each kind once
//              per member and call over the chat's live connection (usePersonalEvents; members
//              only, so guests never get one). Dismissing it in one tab dismisses it in all of
//              them (browser storage, whose change the other tabs hear); none shows on that
//              call's own page. Shown at the top of the main column, like the shell's banners.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { readStored, writeStored } from '../app/storage.js';
import { usePersonalEvents } from '../chat/index.js';
import './calls.css';

const PREFIX = 'se.callNotice.';
const keyOf = (notice) => `${PREFIX}${notice.call.id}.${notice.kind}`;
// The minutes up to the planned start, rounded up: the server sends "soon" as early as the
// "Reminder before a call" setting says, so the text cannot be a fixed number.
function startsIn(scheduledFor) {
  const minutes = Math.ceil((Date.parse(scheduledFor) - Date.now()) / 60_000);
  if (!(minutes > 0)) return 'starts soon';
  return `starts in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
const textOf = ({ kind, call }) =>
  kind === 'live' ? `${call.title} is live now` : `${call.title} ${startsIn(call.scheduledFor)}`;

export default function CallNotices() {
  const { pathname } = useLocation();
  const [notices, setNotices] = useState([]);
  const here = useRef(pathname); // the page now, for events that arrive later
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);

  const onEvent = useCallback((event) => {
    if (event.type !== 'callReminder' || readStored(keyOf(event))) return;
    // Already on the call's own page: nothing to tell.
    if (here.current === `/calls/${event.call.id}`) return;
    setNotices((now) => [...now.filter((n) => keyOf(n) !== keyOf(event)), event]);
  }, []);
  usePersonalEvents(onEvent);

  // Another tab dismissed one: here too.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key?.startsWith(PREFIX))
        setNotices((now) => now.filter((n) => keyOf(n) !== event.key));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dismiss = (notice) => {
    writeStored(keyOf(notice), '1');
    setNotices((now) => now.filter((n) => keyOf(n) !== keyOf(notice)));
  };

  // Opening the call's page answers its notices.
  const shown = notices.filter((n) => pathname !== `/calls/${n.call.id}`);
  if (shown.length === 0) return null;
  return (
    <div className="call-notices">
      {shown.map((notice) => (
        <p key={keyOf(notice)} className="banner call-notice" role="status">
          <strong>{textOf(notice)}</strong>
          <Link className="button" to={`/calls/${notice.call.id}`} onClick={() => dismiss(notice)}>
            Listen
          </Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => dismiss(notice)}
          >
            Dismiss
          </button>
        </p>
      ))}
    </div>
  );
}
