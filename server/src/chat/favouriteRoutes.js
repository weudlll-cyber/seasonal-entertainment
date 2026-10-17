// ============================================================
// File:        favouriteRoutes.js
// Path:        server/src/chat/favouriteRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/chat/favourites, members only (guests have none): the member's own
//              favourite rooms and members, with an online mark (an open chat socket). The
//              account always comes from the session, never from the request, so nobody can
//              read or change someone else's favourites. Only rooms the member may read and
//              existing accounts other than their own can be favourites; guests are not
//              accounts and so can never be one.
// ============================================================

import express from 'express';
import { findUserById } from '../accounts/userStore.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import {
  addFavouriteRoom,
  addFavouriteUser,
  favouriteRoomSlugs,
  favouriteUsers,
  removeFavouriteRoom,
  removeFavouriteUser,
} from './favouriteStore.js';
import { findRoomBySlug } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export function favouriteRoutes(db, hub) {
  const router = express.Router();

  // Unknown and unreadable rooms answer the same 404 (as in routes.js).
  const loadRoom = (req, res, next) => {
    const room = findRoomBySlug(db, req.params.slug);
    if (!room || !canRead(room, chatViewer(req))) {
      return sendError(res, 404, 'not_found', 'No such room.');
    }
    req.room = room;
    next();
  };
  const loadMember = loadById((id) => findUserById(db, id), 'member', 'member');
  const notSelf = (req, res, next) =>
    req.member.id === req.user.id
      ? sendError(res, 400, 'invalid_input', 'You cannot add yourself.')
      : next();

  router.get('/', allow('member'), (req, res) => {
    const online = hub.onlineUserIds();
    // Only rooms the member may still read (a role or room change can take one away).
    const viewer = chatViewer(req);
    const rooms = favouriteRoomSlugs(db, req.user.id).filter((slug) =>
      canRead(findRoomBySlug(db, slug), viewer)
    );
    const users = favouriteUsers(db, req.user.id).map((u) => ({ ...u, online: online.has(u.id) }));
    res.json({ ok: true, rooms, users });
  });

  router.put('/rooms/:slug', allow('member'), loadRoom, (req, res) => {
    addFavouriteRoom(db, req.user.id, req.room.id);
    res.json({ ok: true });
  });

  router.delete('/rooms/:slug', allow('member'), loadRoom, (req, res) => {
    removeFavouriteRoom(db, req.user.id, req.room.id);
    res.json({ ok: true });
  });

  router.put('/users/:id', allow('member'), loadMember, notSelf, (req, res) => {
    addFavouriteUser(db, req.user.id, req.member.id);
    res.json({ ok: true });
  });

  router.delete('/users/:id', allow('member'), loadMember, (req, res) => {
    removeFavouriteUser(db, req.user.id, req.member.id);
    res.json({ ok: true });
  });

  return router;
}
