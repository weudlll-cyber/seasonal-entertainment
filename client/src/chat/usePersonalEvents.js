// ============================================================
// File:        usePersonalEvents.js
// Path:        client/src/chat/usePersonalEvents.js
// Project:     Seasonal Entertainment
// Description: Runs `handler(event)` for every event of the signed-in member's own (new direct
//              messages, room activity, own reads; connection.js), with the live connection
//              following the account. Shared by the direct-message views and the unread
//              counters.
// ============================================================

import { useEffect } from 'react';
import { useSession } from '../session/SessionContext.jsx';
import { connectAs, joinPersonal } from './connection.js';

// handler: stable (useCallback), or the subscription restarts every render.
export function usePersonalEvents(handler) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId !== null) connectAs(userId);
  }, [userId]);
  useEffect(() => (userId === null ? undefined : joinPersonal(handler)), [userId, handler]);
}
