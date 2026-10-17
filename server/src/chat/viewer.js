// ============================================================
// File:        viewer.js
// Path:        server/src/chat/viewer.js
// Project:     Seasonal Entertainment
// Description: Who is using the chat (an account, or a guest held in the session) and what
//              that viewer may do in a room. One rule set for HTTP routes and the WebSocket:
//              an organiser or admin who still has to set up the required 2FA counts as a
//              member for reading, writing and moderation alike.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { sessionUser } from '../http/session.js';
import { needsTwoFactorSetup } from '../twofa/gate.js';

// user: the account or null; guest: { id, name } from the session or null; staff: may act as
// organiser here (the role, and the 2FA requirement met).
function makeViewer(user, guest, twoFactorMissing) {
  return {
    user,
    guest: user ? null : guest,
    staff: Boolean(user) && roleAtLeast(user.role, 'organiser') && !twoFactorMissing,
  };
}

// HTTP: req.user and the 2FA gate's mark (req.staffRefusal, twofa/gate.js) are already set.
export const chatViewer = (req) =>
  makeViewer(req.user ?? null, req.session?.chatGuest ?? null, Boolean(req.staffRefusal));

// WebSocket: the same rule from the account as it is in the database right now. null when
// the session's account no longer qualifies (locked, deleted, epoch changed).
export function sessionViewer(db, config, session) {
  const user = sessionUser(db, session);
  if (!user && session?.userId !== undefined) return null;
  const twoFactorMissing = Boolean(user) && needsTwoFactorSetup(db, config, user);
  return makeViewer(user, session?.chatGuest ?? null, twoFactorMissing);
}

function passes(level, viewer) {
  if (level === 'everyone') return true;
  if (level === 'members') return Boolean(viewer.user);
  return viewer.staff;
}

export const canRead = (room, viewer) => passes(room.readAccess, viewer);
export const canWrite = (room, viewer) => passes(room.writeAccess, viewer);
export const isModerator = (viewer) => viewer.staff;
