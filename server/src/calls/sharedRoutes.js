// ============================================================
// File:        sharedRoutes.js
// Path:        server/src/calls/sharedRoutes.js
// Project:     Seasonal Entertainment
// Description: Sharing a call with the games (shared.js; docs/CALLS.md). PUT
//              /api/calls/:id/shared { shared, replace? } for every organiser and admin, on a
//              scheduled or live call; sharing while another call is shared answers 409
//              shared_elsewhere with that call unless replace is true. Public: GET
//              /api/public/shared-call, which call is shared now, for the shared call view in
//              the games (docs/GAME-INTEGRATION.md section 9).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { optionalYesNo, validBody } from '../http/validate.js';
import { callSteps } from './middleware.js';
import { shown } from './routes.js';
import {
  answerSharedElsewhere,
  shareCall,
  sharedCall,
  sharedElsewhere,
  unshareCall,
} from './shared.js';
import { findCall } from './store.js';

const SHARE_FIELDS = {
  shared: (v) => (typeof v === 'boolean' ? null : 'Share with the games is yes or no.'),
  replace: optionalYesNo('Replace the shared call'),
};

export function callShareRoutes(db, config, service, chat) {
  const router = express.Router();
  const { configured, loadCall } = callSteps(db, config, service);
  const perUser = makeLimiter(config.rateLimits.callManage, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  router.put('/:id/shared', allow('organiser'), configured, loadCall, perUser, (req, res) => {
    const input = validBody(req, res, SHARE_FIELDS);
    if (!input) return;
    const call = req.call;
    if (call.status === 'ended') {
      return sendError(res, 409, 'wrong_status', 'An ended call cannot be shared.');
    }
    // Asking for what already holds changes (and audits) nothing.
    if (input.shared && !call.sharedWithGames) {
      const other = sharedElsewhere(db, call.id);
      if (other && !input.replace) return answerSharedElsewhere(res, other);
      shareCall(db, req.user, call, other);
    } else if (!input.shared && call.sharedWithGames) {
      unshareCall(db, req.user, call);
    }
    res.json({ ok: true, call: shown(findCall(db, call.id), chat) });
  });

  return router;
}

export function publicSharedCallRoutes(db, service) {
  const router = express.Router();
  router.get('/shared-call', allow('public'), (_req, res) => {
    res.set('Cache-Control', 'public, max-age=5');
    res.json({ v: 1, call: service ? sharedCall(db) : null });
  });
  return router;
}
