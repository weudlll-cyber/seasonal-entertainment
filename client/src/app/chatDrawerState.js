// ============================================================
// File:        chatDrawerState.js
// Path:        client/src/app/chatDrawerState.js
// Project:     Seasonal Entertainment
// Description: What this browser remembers about the chat drawer: whether it was open and the
//              last room. Kept with the never-throwing storage helper: with storage blocked
//              the drawer simply starts closed, in the first room.
// ============================================================

import { readStored, writeStored } from './storage.js';

const OPEN_KEY = 'se.chatDrawer.open';
const ROOM_KEY = 'se.chatDrawer.room';

export function readDrawerState() {
  return { open: readStored(OPEN_KEY) === 'true', room: readStored(ROOM_KEY) };
}

export function rememberDrawerOpen(open) {
  writeStored(OPEN_KEY, open ? 'true' : null);
}

export function rememberDrawerRoom(room) {
  writeStored(ROOM_KEY, room);
}

// The room to show: the remembered one while the reader may still read it, else the first.
export function roomToShow(remembered, rooms) {
  if (!rooms?.length) return null;
  return rooms.some((r) => r.slug === remembered) ? remembered : rooms[0].slug;
}
