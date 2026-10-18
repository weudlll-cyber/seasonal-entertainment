// ============================================================
// File:        useChatRooms.js
// Path:        client/src/chat/useChatRooms.js
// Project:     Seasonal Entertainment
// Description: The rooms the current reader may read, and who they are in the chat (guest
//              name, moderator). Part of the module's public API (index.js): a host's own room
//              picker (the site's chat drawer) uses it too. Loads once the account is known and
//              again when it changes; reload() after a change such as a new guest name.
//              include: the slug of an unlisted room (a call's chat) to add when readable.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';

// Returns { info: { rooms, me } | null, error, reload }.
export function useChatRooms(include = null) {
  const { user } = useSession();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const known = user !== undefined; // undefined: the account is still loading
  const userId = user?.id;

  useEffect(() => {
    if (!known) return;
    api(include ? `/chat/rooms?include=${encodeURIComponent(include)}` : '/chat/rooms')
      .then(setInfo)
      .catch((err) => setError(err.message));
  }, [known, userId, version, include]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { info, error, reload };
}
