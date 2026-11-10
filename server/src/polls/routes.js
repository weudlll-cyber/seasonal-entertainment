// ============================================================
// File:        routes.js
// Path:        server/src/polls/routes.js
// Project:     Seasonal Entertainment
// Description: The polls API under /api/polls (docs/POLLS.md, "API"; decided 2026-11-10):
//              everyone lists the polls (each as the viewer may see it, store.js shownPoll);
//              organisers and admins create, end early, extend and switch anonymous before the
//              first vote; signed-in members vote, one vote per account; only admins delete.
//              Creating, ending, extending and deleting are audited (poll.create, poll.end,
//              poll.extend, poll.delete). Every change tells the members' open pages at once
//              ("polls" over the chat's live connection); guests' pages reload on a timer.
// ============================================================

import express from 'express';
import { validatePoll, validateVote } from '@seasonal-entertainment/shared/pollRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { canDelete, canManage } from '../calls/routes.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import {
  castVote,
  createPoll,
  deletePoll,
  endPoll,
  extendPoll,
  findPoll,
  isOpen,
  listPolls,
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
  endsAt: body.endsAt ?? null,
});

// chat: mountChat's handle (notify.members: an event to every signed-in member's open pages).
export function pollRoutes(db, config, chat) {
  const router = express.Router();
  const perUser = (limit) => makeLimiter(limit, { keyGenerator: (req) => `user:${req.user.id}` });
  const manageLimit = perUser(config.rateLimits.pollManage);
  const voteLimit = perUser(config.rateLimits.pollVote);
  const loadPoll = loadById((id) => findPoll(db, id), 'poll', 'poll');
  const viewerOf = (req) => ({ userId: req.user?.id ?? null, team: canManage(req) });
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
      polls: listPolls(db, viewerOf(req)),
    });
  });

  router.post('/', allow('organiser'), manageLimit, (req, res) => {
    const input = pollInput(req.body);
    const problem = validatePoll(input);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    const poll = findPoll(db, createPoll(db, input, req.user));
    audit(req, 'poll.create', poll);
    changed();
    res.status(201).json({ ok: true, poll: shownPoll(db, poll, viewerOf(req)) });
  });

  router.post('/:id/vote', allow('member'), voteLimit, loadPoll, mustBeOpen, (req, res) => {
    const ballot = { options: req.body?.options ?? [], text: req.body?.text ?? '' };
    const problem = validateVote(req.poll, ballot);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    if (castVote(db, req.poll, req.user.id, ballot) === 'voted') {
      return sendError(res, 409, 'already_voted', 'You have voted in this poll already.');
    }
    changed();
    res.json({ ok: true, poll: shownPoll(db, req.poll, viewerOf(req)) });
  });

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
