// ============================================================
// File:        viewer.js
// Path:        server/src/chat/viewer.js
// Project:     Seasonal Entertainment
// Description: Who is using the chat (an account, or a guest held in the session) and what
//              that viewer may do in a room. One rule set for HTTP routes and the WebSocket:
//              an organiser or admin who still has to set up the required 2FA counts as a
//              member for reading, writing and moderation alike. Guests write only in rooms
//              marked guest-writable.
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

// Any account, not the one asking (who may read a room, for @mentions and the member search):
// the same rule as for that account's own requests.
export function accountViewer(db, config, user) {
  return makeViewer(user, null, needsTwoFactorSetup(db, config, user));
}

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
// Guests write only in rooms explicitly marked guest-writable, whatever the write level says.
// A closed room (a call that has ended) is read-only for everyone.
export const canWrite = (room, viewer) =>
  !room.closed && passes(room.writeAccess, viewer) && (Boolean(viewer.user) || room.guestWritable);
export const isModerator = (viewer) => viewer.staff;
