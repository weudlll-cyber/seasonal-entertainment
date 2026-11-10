// ============================================================
// File:        usePolls.js
// Path:        client/src/polls/usePolls.js
// Project:     Seasonal Entertainment
// Description: The polls as this viewer may see them (GET /api/polls; docs/POLLS.md), kept
//              current the site's existing ways: a member's pages reload at once on the
//              "polls" event of the chat's live connection (usePersonalEvents), every page
//              after this page changed a poll (pollsChanged(), as callsChanged() does for
//              calls), every minute for guests' pages (useCallsSummary's interval), and when
//              the next open poll reaches its end time.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { usePersonalEvents } from '../chat/index.js';

const POLL_MS = 60_000;
const CHANGED = 'se:polls-changed';

// Tell every polls list on the page to ask again (after a vote, a new poll, an end).
export const pollsChanged = () => window.dispatchEvent(new Event(CHANGED));

// Returns { answer: { canManage, canDelete, polls } or null while loading, error }.
export function usePolls() {
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api('/polls')
        .then((next) => {
          setAnswer(next);
          setError(null);
        })
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHANGED, load);
    };
  }, [load]);
  usePersonalEvents(useCallback((event) => event.type === 'polls' && load(), [load]));

  // The soonest end of an open poll: reload just after it, so it shows as ended.
  const nextEnd = Math.min(
    ...(answer?.polls ?? []).filter((p) => p.open && p.endsAt).map((p) => Date.parse(p.endsAt))
  );
  useEffect(() => {
    const wait = Math.max(0, nextEnd - Date.now()) + 1000;
    // Over about 24 days a timer fires at once; the minute's reload covers such an end.
    if (!Number.isFinite(nextEnd) || wait > 2 ** 31 - 1) return undefined;
    const timer = setTimeout(load, wait);
    return () => clearTimeout(timer);
  }, [nextEnd, load]);

  return { answer, error };
}
