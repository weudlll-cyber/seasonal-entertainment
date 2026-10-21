// ============================================================
// File:        useCalls.js
// Path:        client/src/calls/useCalls.js
// Project:     Seasonal Entertainment
// Description: The GET /api/calls answer ({ configured, calls, reminders }) for whoever is
//              signed in: the Calls page's lists, so a viewer sees exactly the calls the Calls
//              page shows them (docs/CALLS.md). Used by the home page (Next call box, "Up
//              next") and the events page. Asked again when the session changes (the member's
//              reminders); null while loading or when it failed.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';

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
