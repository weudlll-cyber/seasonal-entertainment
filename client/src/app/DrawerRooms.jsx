// ============================================================
// File:        DrawerRooms.jsx
// Path:        client/src/app/DrawerRooms.jsx
// Project:     Seasonal Entertainment
// Description: The chat drawer's Rooms tab: the room picker (a member's favourite rooms first)
//              with the star and bell for the current room and each room's unread count (dimmed
//              when muted), and the compact chat panel of that room; "No rooms available."
//              (NoRooms) when the reader has none. This browser remembers the last room
//              (chatDrawerState.js); one the reader may no longer read gives way to their first
//              (roomToShow, the rule of every chat host: docs/CHAT.md, "Which room opens").
// ============================================================

import { useState } from 'react';
import {
  ChatPanel,
  NoRooms,
  RoomBell,
  RoomStar,
  groupRooms,
  roomToShow,
  useChatRooms,
  useFavourites,
  useUnread,
} from '../chat/index.js';
import { readDrawerState, rememberDrawerRoom } from './chatDrawerState.js';
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

  if (!info) return null;
  if (!room) return <NoRooms />;
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
