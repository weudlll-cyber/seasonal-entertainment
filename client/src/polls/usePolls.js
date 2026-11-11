// ============================================================
// File:        usePolls.js
// Path:        client/src/polls/usePolls.js
// Project:     Seasonal Entertainment
// Description: The polls as this viewer may see them (GET /api/polls; docs/POLLS.md) and their
//              summary for the sidebar's dot and the home card (GET /api/polls/summary), kept
//              current the site's existing ways: a member's pages reload at once on the
//              "polls" event of the chat's live connection (usePersonalEvents), every page
//              after this page changed a poll (pollsChanged(), as callsChanged() does for
//              calls), every minute for guests' pages (useCallsSummary's interval), and when
//              the next open poll reaches its end time; a call's page every 10 seconds; one
//              poll for a chat room's card (usePoll).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { usePersonalEvents } from '../chat/index.js';

const POLL_MS = 60_000;
// On a call's page its polls last minutes: everyone in the call (guests too, who get no live
// event) sees a new poll or a vote within seconds.
const CALL_POLL_MS = 10_000;
const CHANGED = 'se:polls-changed';

// Tell every polls list on the page to ask again (after a vote, a new poll, an end).
export const pollsChanged = () => window.dispatchEvent(new Event(CHANGED));

// path's answer, reloaded as above (every `every` ms); endsOf(answer): the end times (ISO) of
// its open polls.
function useLivePolls(path, endsOf, every = POLL_MS) {
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api(path)
        .then((next) => {
          setAnswer(next);
          setError(null);
        })
        .catch((err) => setError(err.message)),
    [path]
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, every);
    window.addEventListener(CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHANGED, load);
    };
  }, [load, every]);
  usePersonalEvents(useCallback((event) => event.type === 'polls' && load(), [load]));

  // The soonest end of an open poll: reload just after it, so it shows as ended.
  const nextEnd = Math.min(...(answer ? endsOf(answer) : []).map((at) => Date.parse(at)));
  useEffect(() => {
    const wait = Math.max(0, nextEnd - Date.now()) + 1000;
    // Over about 24 days a timer fires at once; the minute's reload covers such an end.
    if (!Number.isFinite(nextEnd) || wait > 2 ** 31 - 1) return undefined;
    const timer = setTimeout(load, wait);
    return () => clearTimeout(timer);
  }, [nextEnd, load]);

  return { answer, error };
}

const openEnds = (polls) => polls.filter((p) => p.open && p.endsAt).map((p) => p.endsAt);

// { answer: { canManage, canDelete, steps (for the create form), polls } or null, error };
// callId: only that call's polls (its page), asked every 10 seconds.
export const usePolls = (callId = null) =>
  useLivePolls(
    callId === null ? '/polls' : `/polls?call=${callId}`,
    (answer) => openEnds(answer.polls),
    callId === null ? POLL_MS : CALL_POLL_MS
  );

// { answer: { unvoted, newest (the newest open poll the viewer sees, or null) } or null }.
export const usePollSummary = () =>
  useLivePolls('/polls/summary', (answer) => (answer.newest ? openEnds([answer.newest]) : []));

// { answer: { canManage, canDelete, poll } or null, error }: one poll (a room poll's card in
// the chat's timeline, ChatPollCard.jsx); error once it is gone (deleted).
export const usePoll = (id) => useLivePolls(`/polls/${id}`, (answer) => openEnds([answer.poll]));
