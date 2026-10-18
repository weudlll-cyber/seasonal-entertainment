// ============================================================
// File:        DrawerRooms.jsx
// Path:        client/src/app/DrawerRooms.jsx
// Project:     Seasonal Entertainment
// Description: The chat drawer's Rooms tab: the room picker (a member's favourite rooms first)
//              with the star and bell for the current room and each room's unread count (dimmed
//              when muted), and the compact
//              chat panel of that room.
//              This browser remembers the last room (chatDrawerState.js).
// ============================================================

import { useState } from 'react';
import {
  ChatPanel,
  RoomBell,
  RoomStar,
  groupRooms,
  useChatRooms,
  useFavourites,
  useUnread,
} from '../chat/index.js';
import { readDrawerState, rememberDrawerRoom, roomToShow } from './chatDrawerState.js';
import RoomPicker, { seasonOf } from './RoomPicker.jsx';

export default function DrawerRooms() {
  const { info } = useChatRooms();
  const favourites = useFavourites();
  const unread = useUnread();
  // Colours follow the rooms' own order, so a room keeps its colour when it becomes a favourite.
  const coloured = (info?.rooms ?? []).map((r, i) => ({ ...r, season: seasonOf(i) }));
  const groups = groupRooms(coloured, favourites.rooms);
  const [roomChoice, setRoomChoice] = useState(() => readDrawerState().room);
  const room = roomToShow(roomChoice, info?.rooms);

  function changeRoom(slug) {
    setRoomChoice(slug);
    rememberDrawerRoom(slug);
  }

  if (!info || !room) return null;
  return (
    <>
      <div className="chat-drawer__rooms">
        <RoomPicker
          rooms={[...groups.favourites, ...groups.others]}
          favouriteCount={groups.favourites.length}
          unreadOf={unread.room}
          mutedOf={unread.muted}
          mentionOf={unread.mention}
          value={room}
          onChange={changeRoom}
        />
        <RoomStar room={coloured.find((r) => r.slug === room)} />
        <RoomBell room={coloured.find((r) => r.slug === room)} />
      </div>
      <ChatPanel room={room} variant="compact" />
    </>
  );
}
