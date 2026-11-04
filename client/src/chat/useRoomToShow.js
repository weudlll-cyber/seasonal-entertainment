// ============================================================
// File:        useRoomToShow.js
// Path:        client/src/chat/useRoomToShow.js
// Project:     Seasonal Entertainment
// Description: Which room a chat host opens (docs/CHAT.md, "Which room opens"): the one asked
//              for (a link's ?room=, the drawer's remembered room) while the reader may read it,
//              else the first room of the reader's own list (the server's order, so "general"
//              whenever they may see it); none when the list is empty. A room asked for that is
//              not in the list is "unavailable" — the same whether it is closed to this reader
//              or does not exist, so nothing tells the two apart.
// ============================================================

import { useChatRooms } from './useChatRooms.js';

// The room to show: the asked-for one while the reader may still read it, else the first;
// null when the reader has no room.
export function roomToShow(asked, rooms) {
  if (!rooms?.length) return null;
  return rooms.some((r) => r.slug === asked) ? asked : rooms[0].slug;
}

// asked: a slug or null; unlisted: it may be an unlisted room (a call's chat, from a mention's
// link), so it goes along as include and opens while readable. Returns { room, unavailable,
// error }: room is undefined while the list loads, null with no room.
export function useRoomToShow(asked, unlisted = false) {
  const { info, error } = useChatRooms(unlisted ? asked : null);
  if (!info) return { room: undefined, unavailable: false, error };
  const room = roomToShow(asked, info.rooms);
  return { room, unavailable: Boolean(asked) && room !== asked, error };
}
