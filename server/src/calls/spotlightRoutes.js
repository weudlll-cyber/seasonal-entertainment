// ============================================================
// File:        spotlightRoutes.js
// Path:        server/src/calls/spotlightRoutes.js
// Project:     Seasonal Entertainment
// Description: Who is highlighted on the stage (rules: spotlight.js): an organiser picks a
//              speaker or "all speakers" (audited); a speaker highlights themselves or stops;
//              a speaker's client reports starting and stopping a screen share, which takes
//              the spotlight. Speakers only for the last two: the server checks the stage.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { callSteps } from './middleware.js';
import { findParticipant } from './participants.js';
import { applySpotlight } from './spotlightUpdate.js';

const ORGANISER_CHOICE = "An organiser's choice stands until an organiser changes it.";

const answer = (res, result) =>
  result.refused
    ? sendError(res, 409, result.refused, ORGANISER_CHOICE)
    : res.json({ ok: true, spotlight: result.state });

export function callSpotlightRoutes(db, config, service) {
  const router = express.Router();
  const steps = callSteps(db, config, service);
  const call = [steps.configured, steps.loadCall, steps.live];
  const speaker = [allow('member'), ...call, steps.loadMe, steps.perUser];
  const onStage = (req, res, next) =>
    req.me.onStage ? next() : sendError(res, 403, 'not_on_stage', 'Only speakers can do this.');
  // The boolean body field `name`, or null after answering 400.
  const flag = (req, res, name) => {
    const value = req.body?.[name];
    if (typeof value === 'boolean') return value;
    sendError(res, 400, 'invalid_input', `${name} must be true or false.`);
    return null;
  };

  // identity: a speaker's identity, or null for "all speakers".
  router.put('/:id/spotlight', allow('organiser'), ...call, steps.perUser, async (req, res) => {
    const identity = req.body?.identity ?? null;
    if (identity !== null && !findParticipant(db, req.call.id, identity)?.onStage) {
      return sendError(res, 409, 'not_a_speaker', 'Only a speaker can be highlighted.');
    }
    const result = await applySpotlight(db, service, req.call, { type: 'organiser', identity });
    recordAudit(db, req.user, {
      action: 'call.spotlight',
      targetType: 'call',
      targetId: req.call.id,
      after: { spotlight: identity ?? 'all speakers' },
    });
    answer(res, result);
  });

  router.post('/:id/spotlight/self', ...speaker, onStage, async (req, res) => {
    const on = flag(req, res, 'on');
    if (on === null) return;
    const action = { type: 'self', identity: req.me.identity, on };
    answer(res, await applySpotlight(db, service, req.call, action));
  });

  router.post('/:id/spotlight/share', ...speaker, onStage, async (req, res) => {
    const sharing = flag(req, res, 'sharing');
    if (sharing === null) return;
    const action = { type: 'share', identity: req.me.identity, sharing };
    answer(res, await applySpotlight(db, service, req.call, action));
  });

  return router;
}
