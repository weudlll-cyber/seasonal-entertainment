// ============================================================
// File:        routes.js
// Path:        server/src/games/routes.js
// Project:     Seasonal Entertainment
// Description: Public GET /api/games: the game cards this viewer may see (guests: "everyone"
//              only; members also "members"; organisers and admins all), each with its open
//              sign-ups (openRounds: soonest first; docs/OPEN-ROUNDS.md), shown to everyone who
//              sees the card, signed in or not (decided 2026-11-04). Hidden games are not sent at
//              all.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { listGamesFor } from './store.js';

// openRounds: the poller (openRounds.js).
export function gameRoutes(db, openRounds) {
  const router = express.Router();
  router.get('/', allow('public'), (req, res) => {
    const games = listGamesFor(db, req.user).map((game) => ({
      ...game,
      openRounds: openRounds.roundsFor(game.id),
    }));
    res.json({ ok: true, games });
  });
  return router;
}
