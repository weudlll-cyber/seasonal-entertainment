// ============================================================
// File:        useCalls.js
// Path:        client/src/calls/useCalls.js
// Project:     Seasonal Entertainment
// Description: The GET /api/calls answer ({ configured, calls, reminders }) for whoever is
//              signed in: the Calls page's lists, so a viewer sees exactly the calls the Calls
//              page shows them (docs/CALLS.md). Used by the home page (Next call box, "Up
//              next"), the events page and the Start here page (nextCallOf). Asked again when
//              the session changes (the member's reminders); null while loading or when it
//              failed.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';

// The one call to point a newcomer to (the Start here page): the live one, else the next
// planned one; null while calls are not set up or there is none.
export function nextCallOf(calls) {
  if (!calls?.configured) return null;
  return calls.calls.live[0] ?? calls.calls.upcoming[0] ?? null;
}

export function useCalls() {
  const { user } = useSession();
  const [calls, setCalls] = useState(null);
  const userId = user?.id;
  useEffect(() => {
    api('/calls')
      .then(setCalls)
      .catch(() => setCalls(null));
  }, [userId]);
  return calls;
}
