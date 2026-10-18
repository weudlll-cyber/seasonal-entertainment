// ============================================================
// File:        stageRoutes.js
// Path:        server/src/calls/stageRoutes.js
// Project:     Seasonal Entertainment
// Description: Organisers' stage actions on a live call, through the call service (docs/
//              CALLS.md, "The stage"): invite a listener to the stage (microphone, camera,
//              screen share with its audio; refused for guests, members muted or banned in the
//              chat, people not connected and above the stage cap), take someone off the
//              stage (publishing revoked: the call service unpublishes their tracks), mute a
//              speaker's microphone. A speaker may also leave the stage. Organiser actions are
//              audited and rate-limited per account.
// ============================================================

import express from 'express';
import { TrackSource } from 'livekit-server-sdk';
import { findUserById } from '../accounts/userStore.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { getSetting } from '../settings/store.js';
import { stagePermission } from './grants.js';
import { callSteps } from './middleware.js';
import { setOnStage } from './participants.js';
import { countSpeakers, handAttributes, shownName } from './people.js';
import { applySpotlight } from './spotlightUpdate.js';

export function callStageRoutes(db, config, service, chat) {
  const router = express.Router();
  const steps = callSteps(db, config, service);
  const organiserAction = [
    allow('organiser'),
    steps.configured,
    steps.loadCall,
    steps.live,
    steps.loadTarget,
    steps.perUser,
  ];
  const audit = (req, action) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'call',
      targetId: req.call.id,
      after: { participant: req.target.userId ? `user:${req.target.userId}` : 'guest' },
    });

  // Back to listening: no publishing, named as a listener again, own spotlight released.
  async function unstage(call, participant) {
    setOnStage(db, call.id, participant.identity, false);
    const user = findUserById(db, participant.userId);
    await service.updateParticipant(call.roomName, participant.identity, {
      permission: stagePermission(false),
      name: shownName({ user }, false),
    });
    await applySpotlight(db, service, call, { type: 'left', identity: participant.identity });
  }

  router.post('/:id/stage/:identity', ...organiserAction, async (req, res) => {
    const { call, target } = req;
    if (target.guestId) return sendError(res, 403, 'guest_listener', 'Guests can only listen.');
    const user = findUserById(db, target.userId);
    if (chat.people.sanction({ user, guest: null })) {
      return sendError(res, 403, 'sanctioned', 'Members muted in the chat cannot go on the stage.');
    }
    if (target.onStage) return sendError(res, 409, 'on_stage', 'They are on the stage already.');
    const inRoom = await service.listParticipants(call.roomName);
    if (!inRoom.some((p) => p.identity === target.identity)) {
      return sendError(res, 409, 'not_connected', 'They are not in the call right now.');
    }
    if (countSpeakers(inRoom) >= getSetting(db, 'calls.maxSpeakers')) {
      return sendError(res, 409, 'stage_full', 'The stage is full.');
    }
    setOnStage(db, call.id, target.identity, true);
    await service.updateParticipant(call.roomName, target.identity, {
      permission: stagePermission(true),
      name: user.username,
      attributes: handAttributes(null),
    });
    audit(req, 'call.invite');
    res.json({ ok: true });
  });

  router.delete('/:id/stage/:identity', ...organiserAction, async (req, res) => {
    if (!req.target.onStage) {
      return sendError(res, 409, 'not_on_stage', 'They are not on the stage.');
    }
    await unstage(req.call, req.target);
    audit(req, 'call.unstage');
    res.json({ ok: true });
  });

  router.post(
    '/:id/leave-stage',
    allow('member'),
    steps.configured,
    steps.loadCall,
    steps.live,
    steps.loadMe,
    steps.perUser,
    async (req, res) => {
      if (!req.me.onStage) return sendError(res, 409, 'not_on_stage', 'You are not on the stage.');
      await unstage(req.call, req.me);
      res.json({ ok: true });
    }
  );

  router.post('/:id/mute/:identity', ...organiserAction, async (req, res) => {
    const inRoom = await service.listParticipants(req.call.roomName);
    const speaker = inRoom.find((p) => p.identity === req.target.identity);
    const microphones = (speaker?.tracks ?? []).filter(
      (t) => t.source === TrackSource.MICROPHONE && !t.muted
    );
    for (const track of microphones) {
      await service.muteTrack(req.call.roomName, req.target.identity, track.sid);
    }
    audit(req, 'call.mute');
    res.json({ ok: true, muted: microphones.length });
  });

  return router;
}
