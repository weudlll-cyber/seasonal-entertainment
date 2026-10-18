// ============================================================
// File:        unreadRoutes.js
// Path:        server/src/chat/unreadRoutes.js
// Project:     Seasonal Entertainment
// Description: The unread counters (docs/CHAT.md, "Unread counters"), members only (guests have
//              no account to keep read state): GET /api/chat/unread gives every readable room's
//              count and every direct partner's count in one answer, for the client's one
//              shared store; POST /api/chat/rooms/<slug>/read moves the member's marker when a
//              panel showed the newest message. Each change tells the member's other sockets
//              to recount (other tabs stay in step).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { positiveInteger, validBody } from '../http/validate.js';
import { directUnread, markRead, roomUnread } from './readMarkers.js';
import { roomLoader } from './roomLoader.js';
import { listRooms } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export function unreadRoutes(db, hub) {
  const router = express.Router();

  router.get('/unread', allow('member'), (req, res) => {
    const viewer = chatViewer(req);
    const rooms = listRooms(db).filter((room) => canRead(room, viewer));
    const counts = roomUnread(
      db,
      req.user.id,
      rooms.map((r) => r.id)
    );
    res.json({
      ok: true,
      rooms: rooms.map((r) => ({ slug: r.slug, count: counts[r.id] ?? 0 })),
      direct: Object.entries(directUnread(db, req.user.id)).map(([partnerId, count]) => ({
        partnerId: Number(partnerId),
        count,
      })),
    });
  });

  router.post('/rooms/:slug/read', allow('member'), roomLoader(db), (req, res) => {
    const input = validBody(req, res, { lastId: positiveInteger('lastId') });
    if (!input) return;
    markRead(db, req.user.id, 'room', req.room.id, input.lastId);
    hub.sendToUser(req.user.id, { type: 'read' });
    res.json({ ok: true });
  });

  return router;
}
