// ============================================================
// File:        useDirect.js
// Path:        client/src/chat/useDirect.js
// Project:     Seasonal Entertainment
// Description: Data of the direct-message list (docs/CHAT.md, "Direct messages"): the
//              conversations, favourite members first, then the most recent, each with an
//              unread mark, kept live. One conversation: useDirectConversation.js.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useFavourites } from './favourites.js';
import { usePersonalEvents } from './usePersonalEvents.js';

// Favourites first, then everyone else; within each, the most recent conversation first.
export function sortConversations(list) {
  const recent = (a, b) =>
    (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') ||
    a.partner.username.localeCompare(b.partner.username);
  return [
    ...list.filter((c) => c.favourite).sort(recent),
    ...list.filter((c) => !c.favourite).sort(recent),
  ];
}

// Re-runs `load` whenever a direct message arrives for this member, or someone's online
// visibility changed ("presence": the online marks may be different now).
export function useDirectEvents(load) {
  const onEvent = useCallback(
    (event) => (event.type === 'direct' || event.type === 'presence') && load(),
    [load]
  );
  usePersonalEvents(onEvent);
}

// Loaded again when a message arrives and when the favourite members change (a star here or
// in a name menu): favourites are listed first, and favourites without messages are listed.
export function useDirectConversations() {
  const favouriteIds = useFavourites()
    .users.map((u) => u.id)
    .join(',');
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api('/chat/direct')
        .then((data) => setConversations(sortConversations(data.conversations)))
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load, favouriteIds]);
  useDirectEvents(load);
  return { conversations, error };
}
