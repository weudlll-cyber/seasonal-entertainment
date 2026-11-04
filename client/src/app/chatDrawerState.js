// ============================================================
// File:        chatDrawerState.js
// Path:        client/src/app/chatDrawerState.js
// Project:     Seasonal Entertainment
// Description: What this browser remembers about the chat drawer: whether it was open and the
//              last room. Kept with the never-throwing storage helper: with storage blocked
//              the drawer simply starts closed, in the first room (roomToShow, chat/useRoomToShow.js).
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
