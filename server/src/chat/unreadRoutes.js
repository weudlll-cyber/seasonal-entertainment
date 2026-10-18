// ============================================================
// File:        unreadRoutes.js
// Path:        server/src/chat/unreadRoutes.js
// Project:     Seasonal Entertainment
// Description: The unread counters (docs/CHAT.md, "Unread counters"), members only (guests have
//              no account to keep read state): GET /api/chat/unread gives every readable room's
//              count (and its unread @mentions of the member) and every direct partner's count
//              in one answer, for the client's one
//              shared store; POST /api/chat/rooms/<slug>/read moves the member's marker when a
//              panel showed the newest message; PUT / DELETE /api/chat/rooms/<slug>/mute mutes a
//              room for the member (its count is then left out of the room total; still
//              readable as normal). Each change tells the member's other sockets to recount
//              (other tabs and devices stay in step).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { positiveInteger, validBody } from '../http/validate.js';
import {
  directUnread,
  markRead,
  mutedRoomIds,
  roomMentions,
  roomUnread,
  setRoomMuted,
} from './readMarkers.js';
import { roomLoader } from './roomLoader.js';
import { listRooms } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export function unreadRoutes(db, hub) {
  const router = express.Router();

  router.get('/unread', allow('member'), (req, res) => {
    const viewer = chatViewer(req);
    const rooms = listRooms(db).filter((room) => canRead(room, viewer));
    const muted = mutedRoomIds(db, req.user.id);
    const ids = rooms.map((r) => r.id);
    const counts = roomUnread(db, req.user.id, ids);
    const mentions = roomMentions(db, req.user.id, ids);
    res.json({
      ok: true,
      rooms: rooms.map((r) => ({
        slug: r.slug,
        count: counts[r.id] ?? 0,
        muted: muted.has(r.id),
        mentions: mentions[r.id] ?? 0,
      })),
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

  for (const [method, muted] of [
    ['put', true],
    ['delete', false],
  ]) {
    router[method]('/rooms/:slug/mute', allow('member'), roomLoader(db), (req, res) => {
      setRoomMuted(db, req.user.id, req.room.id, muted);
      hub.sendToUser(req.user.id, { type: 'muted' });
      res.json({ ok: true });
    });
  }

  return router;
}
