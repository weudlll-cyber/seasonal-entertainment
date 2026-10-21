// ============================================================
// File:        useRoomGlimpse.js
// Path:        client/src/chat/useRoomGlimpse.js
// Project:     Seasonal Entertainment
// Description: A glimpse of the public room "general" for the home page's Community box
//              (docs/CHAT.md, "Community box"): how many members are shown online and the newest
//              3 messages, from GET /api/chat/glimpse, then kept live on the module's one
//              connection — a new message is added, a hidden one makes it ask again, a new
//              online count replaces the old. The server answers no messages while the room is
//              for members only, and then new ones are not added either. Part of the module's
//              public API (index.js).
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { connectAs, joinRoom } from './connection.js';

const ROOM = 'general';
const COUNT = 3;

// Returns { loaded, online, messages }: messages oldest first, at most 3, never hidden ones.
export function useRoomGlimpse() {
  const { user } = useSession();
  const [glimpse, setGlimpse] = useState({ loaded: false, online: 0, room: null, messages: [] });
  const known = user !== undefined;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!known) return undefined;
    let active = true;
    const load = () =>
      api('/chat/glimpse')
        .then((data) => active && setGlimpse({ loaded: true, ...data }))
        .catch(() => active && setGlimpse((now) => ({ ...now, loaded: true })));
    load();
    connectAs(userId);
    const leave = joinRoom(ROOM, (event) => {
      if (event.type === 'online') setGlimpse((now) => ({ ...now, online: event.count }));
      if (event.type === 'hidden') load();
      if (event.type === 'message') {
        setGlimpse((now) =>
          // Only while the room is public (room is null otherwise), never twice.
          now.room && !now.messages.some((m) => m.id === event.message.id)
            ? { ...now, messages: [...now.messages, event.message].slice(-COUNT) }
            : now
        );
      }
    });
    return () => {
      active = false;
      leave();
    };
  }, [known, userId]);

  return { loaded: glimpse.loaded, online: glimpse.online, messages: glimpse.messages };
}
