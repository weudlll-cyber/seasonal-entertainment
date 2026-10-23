// ============================================================
// File:        usePersonalEvents.js
// Path:        client/src/chat/usePersonalEvents.js
// Project:     Seasonal Entertainment
// Description: Runs `handler(event)` for every event of the signed-in member's own (new direct
//              messages, room activity, own reads, mutes, presence, call reminders, a new device
//              asking for the key, mentions, the weekly recap; the list is PERSONAL in
//              connection.js), with the live connection following the account. Shared by the
//              direct-message views, the unread counters, the favourites, and (through index.js)
//              the site's call notices, the device prompt and the browser notifications.
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
