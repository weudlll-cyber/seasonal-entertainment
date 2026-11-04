// ============================================================
// File:        viewer.js
// Path:        server/src/chat/viewer.js
// Project:     Seasonal Entertainment
// Description: Who is using the chat (an account, or a guest held in the session) and what
//              that viewer may do in a room. One rule set for HTTP routes and the WebSocket:
//              an organiser or admin who still has to set up the required 2FA counts as a
//              member for reading, writing and moderation alike; a member who has to (the
//              "Require 2FA for every member" setting) counts as a guest. Guests write only in
//              rooms marked guest-writable. A room for Discord steps (docs/CHAT.md, "Rooms for
//              Discord steps") is read, and so written, only by accounts with one of its steps (the
//              viewer's steps, computed now: discord/steps.js), and by staff.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { passesStepRule, stepsOfUser } from '../discord/steps.js';
import { sessionUser } from '../http/session.js';
import { needsTwoFactorSetup } from '../twofa/gate.js';

// user: the account or null; guest: { id, name } from the session or null; staff: may act as
// organiser here (the role, and the 2FA requirement met); steps: the account's Discord steps
// (lazily: only a room for steps asks).
function makeViewer(user, guest, twoFactorMissing, stepsOf) {
  const staffRole = Boolean(user) && roleAtLeast(user.role, 'organiser');
  const account = twoFactorMissing && !staffRole ? null : user;
  let steps;
  return {
    user: account,
    guest: account ? null : guest,
    staff: staffRole && !twoFactorMissing,
    get steps() {
      steps ??= account ? stepsOf(account) : [];
      return steps;
    },
  };
}

// HTTP: req.user and the 2FA gate's mark (req.staffRefusal, twofa/gate.js) are already set. A
// guest in a frame on another site is the one its guest token names (embed/auth.js), never a
// cookie's. The steps come from the app's database (app.locals.db).
const guestOf = (req) => (req.embedSite ? req.embedGuest : req.session?.chatGuest) ?? null;
export const chatViewer = (req) =>
  makeViewer(req.user ?? null, guestOf(req), Boolean(req.staffRefusal), (user) =>
    stepsOfUser(req.app.locals.db, user.id)
  );

// Any account, not the one asking (who may read a room, for @mentions and the member search):
// the same rule as for that account's own requests.
export function accountViewer(db, config, user) {
  return makeViewer(user, null, needsTwoFactorSetup(db, config, user), (u) =>
    stepsOfUser(db, u.id)
  );
}

// WebSocket: the same rule from the account as it is in the database right now. null when
// the session's account no longer qualifies (locked, deleted, epoch changed).
export function sessionViewer(db, config, session) {
  const user = sessionUser(db, session);
  if (!user && session?.userId !== undefined) return null;
  const twoFactorMissing = Boolean(user) && needsTwoFactorSetup(db, config, user);
  return makeViewer(user, session?.chatGuest ?? null, twoFactorMissing, (u) =>
    stepsOfUser(db, u.id)
  );
}

function passes(level, viewer) {
  if (level === 'everyone') return true;
  if (level === 'members') return Boolean(viewer.user);
  return viewer.staff;
}

// A room for Discord steps: staff, or an account with one of its steps (rooms without a rule
// pass; guests have no steps).
// The steps are only looked up for a room that has a rule.
const stepsLetIn = (room, viewer) =>
  !room.stepRule?.length || viewer.staff || passesStepRule(room.stepRule, viewer.steps);

export const canRead = (room, viewer) =>
  passes(room.readAccess, viewer) && stepsLetIn(room, viewer);
// Guests write only in rooms explicitly marked guest-writable, whatever the write level says.
// A closed room (a call that has ended) is read-only for everyone. A room for steps needs no
// check here: writing always comes after reading (roomLoader.js, the room lists), which the
// steps already decide.
export const canWrite = (room, viewer) =>
  !room.closed && passes(room.writeAccess, viewer) && (Boolean(viewer.user) || room.guestWritable);
export const isModerator = (viewer) => viewer.staff;
