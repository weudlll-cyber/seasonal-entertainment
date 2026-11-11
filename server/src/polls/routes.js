// ============================================================
// File:        routes.js
// Path:        server/src/polls/routes.js
// Project:     Seasonal Entertainment
// Description: The polls API under /api/polls (docs/POLLS.md, "API"; decided 2026-11-10):
//              everyone lists the polls (each as the viewer may see it, store.js shownPoll);
//              organisers and admins create, end early, extend and switch anonymous before the
//              first vote; signed-in members vote, one vote per account, where the poll lets
//              them (all members, Discord steps, or organisers and admins only; a team poll
//              is "no such poll" for others); only admins delete. GET /summary: the sidebar's
//              dot and the home card. A poll started in a live call (callId) is listed with
//              ?call=<id> on its page; ending the call ends it (calls/endCall.js). A poll
//              started in a chat room (room: its slug; organisers and admins who may write
//              there) gets a card in the room's timeline (chat.polls.post) and is seen only by
//              those who may read the room; GET /:id gives one poll for that card.
//              Creating, ending, extending and deleting are audited (poll.create, poll.end,
//              poll.extend, poll.delete). Every change tells the members' open pages at once
//              ("polls" over the chat's live connection); guests' pages reload on a timer.
// ============================================================

import express from 'express';
import { validatePoll, validateVote } from '@seasonal-entertainment/shared/pollRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { canDelete, canManage } from '../calls/routes.js';
import { findCall } from '../calls/store.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import { listSteps, stepsOfUser } from '../discord/steps.js';
import {
  castVote,
  createPoll,
  deletePoll,
  endPoll,
  extendPoll,
  findPoll,
  isOpen,
  listPolls,
  mayVoteIn,
  pollSummary,
  seesPoll,
  setAnonymous,
  shownPoll,
} from './store.js';

// Only the fields a poll has, whatever else the body carries.
const pollInput = (body = {}) => ({
  question: body.question,
  kind: body.kind,
  options: body.options,
  multiple: Boolean(body.multiple),
  otherText: Boolean(body.otherText),
  results: body.results,
  anonymous: body.anonymous,
  voters: body.voters ?? 'members',
  steps: body.steps ?? [],
  endsAt: body.endsAt ?? null,
  callId: Number.isInteger(body.callId) ? body.callId : null,
  // A chat room's slug: the poll is started there (its card in the timeline).
  room: typeof body.room === 'string' ? body.room : null,
});

const queryCall = (req) => (/^\d+$/.test(req.query.call ?? '') ? Number(req.query.call) : null);

// chat: mountChat's handle (notify.members: an event to every signed-in member's open pages).
export function pollRoutes(db, config, chat) {
  const router = express.Router();
  const perUser = (limit) => makeLimiter(limit, { keyGenerator: (req) => `user:${req.user.id}` });
  const manageLimit = perUser(config.rateLimits.pollManage);
  const voteLimit = perUser(config.rateLimits.pollVote);
  // The account's Discord steps are read only when a step poll asks (once per request).
  const viewerOf = (req) => {
    let steps;
    return {
      userId: req.user?.id ?? null,
      team: canManage(req),
      get steps() {
        steps ??= req.user ? stepsOfUser(db, req.user.id) : [];
        return steps;
      },
      readsRoom: (roomId) => chat.polls.readable(req, roomId),
    };
  };
  // A team poll is "no such poll" for everyone but organisers and admins.
  const loadPoll = loadById((id) => findPoll(db, id), 'poll', 'poll');
  const visible = (req, res, next) =>
    seesPoll(req.poll, viewerOf(req)) ? next() : sendError(res, 404, 'not_found', 'No such poll.');
  const changed = () => chat.notify.members({ type: 'polls' });
  const audit = (req, action, poll, after = {}) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'poll',
      targetId: poll.id,
      after: { question: poll.question, ...after },
    });
  const mustBeOpen = (req, res, next) =>
    isOpen(req.poll) ? next() : sendError(res, 409, 'poll_ended', 'This poll has ended.');

  router.get('/', allow('public'), (req, res) => {
    res.json({
      ok: true,
      canManage: canManage(req),
      canDelete: canDelete(req),
      // ?call=<id>: that call's polls only (its page).
      polls: listPolls(db, viewerOf(req), Date.now(), queryCall(req)),
      // The steps a poll can be limited to, for the create form.
      ...(canManage(req)
        ? { steps: listSteps(db).map(({ id, ladder, name }) => ({ id, ladder, name })) }
        : {}),
    });
  });

  // The sidebar's dot (open polls not yet voted in) and the home card (the newest open poll).
  router.get('/summary', allow('public'), (req, res) => {
    res.json({ ok: true, ...pollSummary(db, viewerOf(req)) });
  });

  router.post('/', allow('organiser'), manageLimit, (req, res) => {
    const input = pollInput(req.body);
    if (input.callId !== null && findCall(db, input.callId)?.status !== 'live') {
      return sendError(res, 409, 'call_not_live', 'A poll can be started only in a live call.');
    }
    // A room poll: in a room this organiser or admin may write in (the room's own rules).
    const room = input.room === null ? null : chat.rooms.findBySlug(input.room);
    if (input.room !== null && (!room || !chat.polls.writable(req, room))) {
      return sendError(res, 403, 'room_not_allowed', 'You cannot start a poll in this room.');
    }
    const known = new Set(listSteps(db).map((s) => s.id));
    const problem =
      validatePoll(input) ??
      (input.voters === 'steps' && !input.steps.every((id) => known.has(id))
        ? 'Please choose among the Discord steps.'
        : null);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    const poll = findPoll(db, createPoll(db, { ...input, roomId: room?.id ?? null }, req.user));
    if (room) chat.polls.post(room, req.user, poll.id);
    audit(req, 'poll.create', poll, poll.callId ? { callId: poll.callId } : {});
    changed();
    res.status(201).json({ ok: true, poll: shownPoll(db, poll, viewerOf(req)) });
  });

  // One poll (a room poll's card in the timeline loads it by its id).
  router.get('/:id', allow('public'), loadPoll, visible, (req, res) => {
    res.json({
      ok: true,
      canManage: canManage(req),
      canDelete: canDelete(req),
      poll: shownPoll(db, req.poll, viewerOf(req)),
    });
  });

  router.post(
    '/:id/vote',
    allow('member'),
    voteLimit,
    loadPoll,
    visible,
    mustBeOpen,
    (req, res) => {
      if (!mayVoteIn(req.poll, viewerOf(req))) {
        const from = req.poll.stepRule.map((s) => s.name).join(' or ');
        return sendError(
          res,
          403,
          'not_allowed',
          from ? `Voting from ${from}.` : 'You cannot vote in this poll.'
        );
      }
      const ballot = { options: req.body?.options ?? [], text: req.body?.text ?? '' };
      const problem = validateVote(req.poll, ballot);
      if (problem) return sendError(res, 400, 'invalid_input', problem);
      if (castVote(db, req.poll, req.user.id, ballot) === 'voted') {
        return sendError(res, 409, 'already_voted', 'You have voted in this poll already.');
      }
      changed();
      res.json({ ok: true, poll: shownPoll(db, req.poll, viewerOf(req)) });
    }
  );

  router.post('/:id/end', allow('organiser'), manageLimit, loadPoll, mustBeOpen, (req, res) => {
    endPoll(db, req.poll.id);
    audit(req, 'poll.end', req.poll);
    changed();
    res.json({ ok: true });
  });

  // A later end time while the poll is open (also for one that was to end by hand).
  router.post('/:id/extend', allow('organiser'), manageLimit, loadPoll, mustBeOpen, (req, res) => {
    const endsAt = req.body?.endsAt;
    const at = typeof endsAt === 'string' ? Date.parse(endsAt) : Number.NaN;
    const current = req.poll.endsAt ? Date.parse(req.poll.endsAt) : Date.now();
    if (Number.isNaN(at) || at <= Math.max(current, Date.now())) {
      return sendError(res, 400, 'invalid_input', 'The new end must lie after the current one.');
    }
    extendPoll(db, req.poll.id, at);
    audit(req, 'poll.extend', req.poll, { endsAt: new Date(at).toISOString() });
    changed();
    res.json({ ok: true });
  });

  router.post('/:id/anonymous', allow('organiser'), manageLimit, loadPoll, (req, res) => {
    if (typeof req.body?.anonymous !== 'boolean') {
      return sendError(res, 400, 'invalid_input', 'Please say whether the poll is anonymous.');
    }
    if (!setAnonymous(db, req.poll.id, req.body.anonymous)) {
      return sendError(res, 409, 'poll_has_votes', 'Someone has voted: this is fixed now.');
    }
    changed();
    res.json({ ok: true });
  });

  router.delete('/:id', allow('admin'), manageLimit, loadPoll, (req, res) => {
    deletePoll(db, req.poll.id);
    audit(req, 'poll.delete', req.poll);
    changed();
    res.json({ ok: true });
  });

  return router;
}
