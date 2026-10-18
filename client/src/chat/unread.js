// ============================================================
// File:        unread.js
// Path:        client/src/chat/unread.js
// Project:     Seasonal Entertainment
// Description: The unread counters, held once per page (docs/CHAT.md, "Unread counters"): every
//              readable room's count and every direct partner's count, loaded in one request
//              and loaded again (briefly debounced) whenever the server says something changed
//              — a new message, a hidden one, or the member's own read or mute in any tab.
//              Every badge reads from here; none fetches on its own. Muted rooms keep their own
//              count but stay out of the room total. Members only: guests have no counters.
// ============================================================

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { usePersonalEvents } from './usePersonalEvents.js';

const EMPTY = { rooms: {}, direct: {} };
const DEBOUNCE_MS = 150;
let state = EMPTY;
let loadedFor = null; // the account the counts belong to
let timer = null;
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

// When the last component using the counters leaves, they are forgotten (as favourites.js).
const subscribe = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      state = EMPTY;
      loadedFor = null;
    }
  };
};

async function load(userId) {
  loadedFor = userId;
  const data = await api('/chat/unread');
  if (loadedFor !== userId) return; // a logout or switch meanwhile
  setState({
    rooms: Object.fromEntries(data.rooms.map((r) => [r.slug, { count: r.count, muted: r.muted }])),
    direct: Object.fromEntries(data.direct.map((d) => [d.partnerId, d.count])),
  });
}

const sum = (counts) => counts.reduce((total, n) => total + n, 0);

// Returns { member, room(slug), muted(slug), setMuted(slug, on), direct(partnerId), roomTotal,
// directTotal }; zeros for guests.
export function useUnread() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const current = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (userId === null) {
      loadedFor = null;
      if (state !== EMPTY) setState(EMPTY);
    } else if (loadedFor !== userId) {
      load(userId).catch(() => {});
    }
  }, [userId]);

  const onEvent = useCallback(() => {
    clearTimeout(timer);
    timer = setTimeout(() => load(userId).catch(() => {}), DEBOUNCE_MS);
  }, [userId]);
  usePersonalEvents(onEvent);

  const rooms = Object.values(current.rooms);
  return {
    member: userId !== null,
    room: (slug) => current.rooms[slug]?.count ?? 0,
    muted: (slug) => current.rooms[slug]?.muted ?? false,
    // The server tells every tab ("muted"), which then recounts.
    setMuted: (slug, on) =>
      api(`/chat/rooms/${encodeURIComponent(slug)}/mute`, { method: on ? 'PUT' : 'DELETE' }),
    direct: (partnerId) => current.direct[partnerId] ?? 0,
    roomTotal: sum(rooms.filter((r) => !r.muted).map((r) => r.count)),
    directTotal: sum(Object.values(current.direct)),
  };
}

// A count as a badge shows it: "99+" above 99.
export const badgeText = (count) => (count > 99 ? '99+' : String(count));
