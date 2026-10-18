// ============================================================
// File:        favourites.js
// Path:        client/src/chat/favourites.js
// Project:     Seasonal Entertainment
// Description: The signed-in member's favourite rooms and members, held once per page so every
//              place that shows them (the drawer's room picker, the full chat's room list, the
//              name menus, the Direct tab) agrees. useFavourites() loads them for members and
//              clears them for guests; adding or removing goes to the server, then reloads; so
//              does a "presence" event (someone showed or hid their online status).
// ============================================================

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { usePersonalEvents } from './usePersonalEvents.js';

const EMPTY = { rooms: [], users: [] };
let state = EMPTY;
let loadedFor = null; // the account the state belongs to
let presenceTimer = null; // one reload per "presence" event, however many components listen
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

// When the last component using favourites leaves, they are forgotten and loaded afresh by
// the next one (as the live connection closes once unused).
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
  const { rooms, users } = await api('/chat/favourites');
  // A reply for an account that is no longer the page's (a logout meanwhile) is dropped.
  if (loadedFor === userId) setState({ rooms, users });
}

// Splits rooms into the favourites (first, under their own heading) and the rest, both in the
// rooms' own order.
export function groupRooms(rooms, favouriteSlugs) {
  const isFavourite = (room) => favouriteSlugs.includes(room.slug);
  return { favourites: rooms.filter(isFavourite), others: rooms.filter((r) => !isFavourite(r)) };
}

// Returns { member, rooms, users, isFavouriteUser(id), setRoom(slug, on), setUser(id, on) }.
// member is false for guests: they have no favourites and see no stars or menus.
export function useFavourites() {
  const { user } = useSession();
  const current = useSyncExternalStore(subscribe, () => state);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId === null) {
      loadedFor = null;
      if (state !== EMPTY) setState(EMPTY);
    } else if (loadedFor !== userId) {
      load(userId).catch(() => {});
    }
  }, [userId]);

  const onEvent = useCallback(
    (event) => {
      if (event.type !== 'presence') return;
      clearTimeout(presenceTimer);
      presenceTimer = setTimeout(() => load(userId).catch(() => {}), 0);
    },
    [userId]
  );
  usePersonalEvents(onEvent);

  const change = useCallback(
    async (path, on) => {
      await api(`/chat/favourites/${path}`, { method: on ? 'PUT' : 'DELETE' });
      await load(userId);
    },
    [userId]
  );

  return {
    member: userId !== null,
    rooms: current.rooms,
    users: current.users,
    isFavouriteUser: (id) => current.users.some((u) => u.id === id),
    setRoom: (slug, on) => change(`rooms/${encodeURIComponent(slug)}`, on),
    setUser: (id, on) => change(`users/${id}`, on),
  };
}
