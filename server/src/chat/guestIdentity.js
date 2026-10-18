// ============================================================
// File:        guestIdentity.js
// Path:        server/src/chat/guestIdentity.js
// Project:     Seasonal Entertainment
// Description: A guest's identity in the chat: a unique guest name, given on the guest's first
//              message or report (or when a guest joins a call, calls/), kept in the session.
//              Moved out of routes.js (2026-10-19) so the call area can use it through the
//              chat's handle (mount.js).
// ============================================================

import { sendError } from '../http/errors.js';
import { assignGuestName, touchGuest } from './store.js';

const saveSession = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

// A guest's first message (or report) gives them a name nobody else holds, kept in the
// session; later ones mark it as still in use. false (after answering 503) if no name is free.
export async function ensureGuest(req, res, viewer, db) {
  if (viewer.user) return true;
  if (viewer.guest) {
    touchGuest(db, viewer.guest.id);
    return true;
  }
  viewer.guest = assignGuestName(db);
  if (!viewer.guest) {
    sendError(res, 503, 'guest_names_exhausted', 'Guest chat is full right now. Please log in.');
    return false;
  }
  req.session.chatGuest = viewer.guest;
  await saveSession(req);
  return true;
}
