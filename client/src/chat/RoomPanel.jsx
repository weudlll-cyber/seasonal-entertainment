// ============================================================
// File:        RoomPanel.jsx
// Path:        client/src/chat/RoomPanel.jsx
// Project:     Seasonal Entertainment
// Description: The chat panel of the room a host was asked for (the chat page's and the
//              embedded chat's ?room=), chosen by useRoomToShow: that room while the reader may
//              read it, else the first of their rooms with the neutral "This room isn't
//              available."; "No rooms available." (NoRooms) when they have none. Hosts with a
//              room picker of their own (the drawer) choose with roomToShow and use NoRooms.
// ============================================================

import { useEffect } from 'react';
import ChatNotice from './ChatNotice.jsx';
import ChatPanel from './ChatPanel.jsx';
import { useRoomToShow } from './useRoomToShow.js';

export const ROOM_UNAVAILABLE = "This room isn't available.";

// Where a room would be: the calm empty state (or the list's load error), in the panel's look.
export function NoRooms({ variant = 'compact', error = null }) {
  return (
    <section className={`se-chat se-chat--${variant}`} aria-label="Chat">
      {error ? <ChatNotice error={error} /> : <p className="chat-note">No rooms available.</p>}
    </section>
  );
}

// room: the slug asked for, or null for the reader's first room; unlisted: it may be an
// unlisted room (useRoomToShow); onRoom(slug | null): the room chosen, for a host that reports
// it (the embed's messages to its page). The rest goes to ChatPanel (variant, showRoomTabs,
// files, guestPrompt).
export default function RoomPanel({ room: asked, unlisted = false, onRoom, ...panel }) {
  const { room, unavailable, error } = useRoomToShow(asked, unlisted);
  useEffect(() => {
    if (room !== undefined) onRoom?.(room);
  }, [room, onRoom]);

  if (room === undefined) return error ? <NoRooms variant={panel.variant} error={error} /> : null;
  if (room === null) return <NoRooms variant={panel.variant} />;
  return (
    <ChatPanel
      room={room}
      unlisted={unlisted && room === asked}
      roomNote={unavailable ? ROOM_UNAVAILABLE : null}
      {...panel}
    />
  );
}
