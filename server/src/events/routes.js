// ============================================================
// File:        routes.js
// Path:        server/src/events/routes.js
// Project:     Seasonal Entertainment
// Description: Public GET /api/events: the active events (rules in UTC). The client turns
//              them into the viewer's week and local times (shared/eventSchedule.js).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { listActiveEvents } from './store.js';

export function eventRoutes(db) {
  const router = express.Router();
  router.get('/', allow('public'), (_req, res) => {
    // `active` is always true here; the public answer leaves it out.
    const events = listActiveEvents(db).map(({ active: _active, ...event }) => event);
    res.json({ ok: true, events });
  });
  return router;
}
