// ============================================================
// File:        joinRoutes.js
// Path:        server/src/calls/joinRoutes.js
// Project:     Seasonal Entertainment
// Description: Joining a live call and raising a hand (docs/CALLS.md, "Joining"). The server is the
//              only authority: it issues a short-lived token with exactly what the participant may
//              do (grants.js) — listeners receive only; organisers and admins start on the stage
//              while it has room. Members join by account, guests by their chat guest identity.
//              Refused for calls that are not live, chat bans and when the participant cap is
//              reached. While a recording runs, only someone who confirmed it (recordingConsent:
//              true) gets a token (docs/CALLS.md, "Recording"); without that, 409 recording_consent
//              and no connection. Hands (members only) are stored here and set as the participant's
//              attributes on the call service, so every client sees one truth.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { getSetting } from '../settings/store.js';
import { callSteps } from './middleware.js';
import { participantFor, setHand, setOnStage } from './participants.js';
import { activeRecording } from './recordings.js';
import { countSpeakers, handAttributes, kindOf, shownName } from './people.js';

export function callJoinRoutes(db, config, service, chat) {
  const router = express.Router();
  const steps = callSteps(db, config, service);
  // Per address: guests have no account to count by.
  const joinLimit = makeLimiter(config.rateLimits.callJoin);

  router.post(
    '/:id/join',
    allow('public'),
    steps.configured,
    steps.loadCall,
    steps.live,
    joinLimit,
    async (req, res) => {
      const who = await chat.people.identify(req, res);
      if (!who) return;
      if (chat.people.sanction(who)?.kind === 'ban') {
        return sendError(res, 403, 'banned', 'You are banned from the chat and its calls.');
      }
      const call = req.call;
      if (activeRecording(db, call.id) && req.body?.recordingConsent !== true) {
        return sendError(res, 409, 'recording_consent', 'This call is being recorded.');
      }
      const me = participantFor(
        db,
        call.id,
        who.user ? { userId: who.user.id } : { guestId: who.guest.id }
      );
      const inRoom = await service.listParticipants(call.roomName);
      const present = inRoom.some((p) => p.identity === me.identity);
      if (!present && inRoom.length >= getSetting(db, 'calls.maxParticipants')) {
        return sendError(res, 403, 'call_full', 'This call is full.');
      }
      // Organisers and admins start on the stage while it has room; everyone else listens.
      let onStage = me.onStage;
      if (who.staff && !onStage && countSpeakers(inRoom) < getSetting(db, 'calls.maxSpeakers')) {
        setOnStage(db, call.id, me.identity, true);
        onStage = true;
      }
      const kind = kindOf(who);
      const token = await service.token({
        roomName: call.roomName,
        identity: me.identity,
        name: shownName(who, onStage),
        onStage,
        attributes: { kind, ...handAttributes(onStage ? null : me.handRaisedAt) },
      });
      res.json({ ok: true, url: service.url, token, identity: me.identity, kind });
    }
  );

  // Members only: guests cannot raise hands (decided 2026-10-18).
  router.post(
    '/:id/hand',
    allow('member'),
    steps.configured,
    steps.loadCall,
    steps.live,
    steps.loadMe,
    steps.perUser,
    async (req, res) => {
      const raised = req.body?.raised;
      if (typeof raised !== 'boolean') {
        return sendError(res, 400, 'invalid_input', 'raised must be true or false.');
      }
      if (req.me.onStage) return sendError(res, 409, 'on_stage', 'You are on the stage already.');
      const handRaisedAt = setHand(db, req.call.id, req.me.identity, raised);
      await service.updateParticipant(req.call.roomName, req.me.identity, {
        attributes: handAttributes(handRaisedAt),
      });
      res.json({ ok: true, raised });
    }
  );

  return router;
}
