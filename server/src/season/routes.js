// ============================================================
// File:        routes.js
// Path:        server/src/season/routes.js
// Project:     Seasonal Entertainment
// Description: Public GET /api/public/season, the season feed the games read (decided
//              2026-11-21; docs/GAME-INTEGRATION.md, "Season feed"): the token in season, since
//              when it leads, and the halving days from 30 days ago to two years ahead. Every
//              value comes from the season clock (shared/seasonClock.js); nothing is computed
//              here a second time. No login; caches may keep an answer for 60 seconds.
// ============================================================

import express from 'express';
import {
  halvingsUntil,
  inSeasonSince,
  seasonClock,
} from '@seasonal-entertainment/shared/seasonClock.js';
import { allow } from '../http/access.js';

const DAY = 24 * 60 * 60;
const PAST_DAYS = 30;
const AHEAD_DAYS = 2 * 365;

const iso = (seconds) => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');

// The feed's answer at `time` (Unix seconds), version 1 of the shape.
export function seasonFeed(time) {
  const season = seasonClock(time).inSeason;
  return {
    v: 1,
    inSeason: { season, token: season.toUpperCase(), since: iso(inSeasonSince(time)) },
    halvingDays: halvingsUntil(time + AHEAD_DAYS * DAY)
      .filter((h) => h.at >= time - PAST_DAYS * DAY)
      .map((h) => ({ day: iso(h.at).slice(0, 10), token: h.token.toUpperCase() })),
  };
}

export function seasonRoutes() {
  const router = express.Router();
  router.get('/season', allow('public'), (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(seasonFeed(Math.floor(Date.now() / 1000)));
  });
  return router;
}
