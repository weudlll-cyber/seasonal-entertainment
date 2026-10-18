// ============================================================
// File:        memberRoutes.js
// Path:        server/src/chat/memberRoutes.js
// Project:     Seasonal Entertainment
// Description: GET /api/chat/members?q=<text>[&room=<slug>]: "Find a member" in the Direct tab
//              and the @mention suggestions, members only, with its own rate limit per account.
//              From 2 characters; at most 10 results (memberSearch.js). With a room, only
//              members who may read that room (the searcher must be able to read it too).
//              Each result is exactly { id, username, canReceive (has a key for private
//              messages), online } — never an email or anything else.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { currentKeyId } from '../keys/store.js';
import { findMembers } from './memberSearch.js';
import { findRoomBySlug } from './store.js';
import { accountViewer, canRead, chatViewer } from './viewer.js';

const QUERY_MIN = 2;
const QUERY_MAX = 24; // the longest username
const RESULTS = 10;
// Room filtering happens after the name match: look at a few more names than are shown.
const CANDIDATES = 50;

export function memberRoutes(db, config, hub) {
  const router = express.Router();
  const perUser = makeLimiter(config.rateLimits.memberSearch, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  router.get('/members', allow('member'), perUser, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < QUERY_MIN || q.length > QUERY_MAX) {
      return sendError(res, 400, 'invalid_input', `Type ${QUERY_MIN} to ${QUERY_MAX} characters.`);
    }
    let room = null;
    if (typeof req.query.room === 'string') {
      room = findRoomBySlug(db, req.query.room);
      // Unknown and unreadable rooms answer the same 404 (roomLoader.js).
      if (!room || !canRead(room, chatViewer(req))) {
        return sendError(res, 404, 'not_found', 'No such room.');
      }
    }
    const online = hub.onlineUserIds();
    const members = findMembers(db, req.user.id, q, room ? CANDIDATES : RESULTS)
      .filter((user) => !room || canRead(room, accountViewer(db, config, user)))
      .slice(0, RESULTS)
      .map((user) => ({
        id: user.id,
        username: user.username,
        canReceive: currentKeyId(db, user.id) !== null,
        online: online.has(user.id),
      }));
    res.json({ ok: true, members });
  });

  return router;
}
