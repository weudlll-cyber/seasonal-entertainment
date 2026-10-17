// ============================================================
// File:        routes.js
// Path:        server/src/games/routes.js
// Project:     Seasonal Entertainment
// Description: Public GET /api/games: the game cards this viewer may see (guests: "everyone"
//              only; members also "members"; organisers and admins all). Hidden games are not
//              sent at all.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { listGamesFor } from './store.js';

export function gameRoutes(db) {
  const router = express.Router();
  router.get('/', allow('public'), (req, res) => {
    res.json({ ok: true, games: listGamesFor(db, req.user) });
  });
  return router;
}
