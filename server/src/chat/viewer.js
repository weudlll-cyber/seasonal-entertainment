// ============================================================
// File:        viewer.js
// Path:        server/src/chat/viewer.js
// Project:     Seasonal Entertainment
// Description: Who is using the chat (an account, or a guest held in the session) and what
//              that viewer may do in a room. One rule set for HTTP routes and the WebSocket.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';

// user: the signed-in account or null; guest: { id, name } from the session or null.
export function chatViewer(req) {
  return { user: req.user ?? null, guest: req.user ? null : (req.session?.chatGuest ?? null) };
}

function passes(level, user) {
  if (level === 'everyone') return true;
  if (level === 'members') return Boolean(user);
  return Boolean(user) && roleAtLeast(user.role, 'organiser');
}

export const canRead = (room, viewer) => passes(room.readAccess, viewer.user);
export const canWrite = (room, viewer) => passes(room.writeAccess, viewer.user);
export const isModerator = (viewer) =>
  Boolean(viewer.user) && roleAtLeast(viewer.user.role, 'organiser');
