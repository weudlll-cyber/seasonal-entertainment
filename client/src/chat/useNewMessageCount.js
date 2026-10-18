// ============================================================
// File:        useNewMessageCount.js
// Path:        client/src/chat/useNewMessageCount.js
// Project:     Seasonal Entertainment
// Description: How many messages arrived in a room while its panel is out of sight (a
//              collapsed call chat): listens on the module's one live connection while
//              `counting`, and starts again at 0 whenever counting starts. Part of the module's
//              public API (index.js). Unlisted rooms (a call's chat) are not in the unread
//              counters (docs/CHAT.md), so this is how a host shows their news.
// ============================================================

import { useEffect, useState } from 'react';
import { useSession } from '../session/SessionContext.jsx';
import { connectAs, joinRoom } from './connection.js';

export function useNewMessageCount(room, counting) {
  const { user } = useSession();
  const [count, setCount] = useState(0);
  const known = user !== undefined;
  const userId = user?.id;

  useEffect(() => {
    if (!counting || !room || !known) return undefined;
    setCount(0);
    connectAs(userId ?? null);
    return joinRoom(room, (event) => {
      if (event.type === 'message') setCount((n) => n + 1);
    });
  }, [room, counting, known, userId]);

  return counting ? count : 0;
}
