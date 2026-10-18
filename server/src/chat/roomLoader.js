// ============================================================
// File:        roomLoader.js
// Path:        server/src/chat/roomLoader.js
// Project:     Seasonal Entertainment
// Description: Loads the room a route's :slug names into req.room, after allow(). Unknown rooms
//              and rooms the viewer may not read answer the same 404, so a room's existence is
//              never revealed. Shared by every chat router that takes a room.
// ============================================================

import { sendError } from '../http/errors.js';
import { findRoomBySlug } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export function roomLoader(db) {
  return (req, res, next) => {
    const room = findRoomBySlug(db, req.params.slug);
    if (!room || !canRead(room, chatViewer(req))) {
      return sendError(res, 404, 'not_found', 'No such room.');
    }
    req.room = room;
    next();
  };
}
