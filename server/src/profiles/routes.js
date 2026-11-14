// ============================================================
// File:        routes.js
// Path:        server/src/profiles/routes.js
// Project:     Seasonal Entertainment
// Description: Member profiles (docs/AUTH.md, "Member profiles"; decided 2026-11-11), for
//              signed-in members only (guests get 401, the client's sign-in prompt):
//              - GET /api/members/:username: name, role, "member since" (the account's
//                creation), About me, the picture's addresses, the Discord steps (as in the
//                chat, chat/authorSteps.js) and whether a direct message to them is possible.
//                A locked account is not found (404) like one that does not exist.
//              - GET /api/members/:username/picture/:variant: thumb or full, never cached.
//              - GET /api/members/:username/games: their cards from the embedded games
//                (games/memberSummary.js; docs/GAME-INTEGRATION.md, "A member's results on
//                their profile"), asked only while they show them; a game that fails is left
//                out. Its own request, so the profile never waits for a game.
//              - PUT /api/profile/game-results ({ show }): "Show my game results", one's own.
//              - PUT /api/profile/about, POST and DELETE /api/profile/picture: one's own. The
//                picture takes the chat images' rules (type, size and megapixels: site settings)
//                and storage (media files under uploads/), through the chat handle
//                (chat.images.storePicture, chat/mount.js); a new one replaces the old, whose
//                files go.
//              The writes count against one limit per account (profileEdit).
// ============================================================

import path from 'node:path';
import express from 'express';
import { cleanAbout, validateAbout } from '@seasonal-entertainment/shared/profileRules.js';
import { shownSteps, stepsOfUser } from '../discord/steps.js';
import { allow } from '../http/access.js';
import { rawBody } from '../http/bodies.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { currentKeyId } from '../keys/store.js';
import { findProfile, removePicture, setAbout, setGameResultsShown, setPicture } from './store.js';

const VARIANTS = { full: 'pictureFile', thumb: 'pictureThumb' };

// What a member sees of another (or of themselves: own). urlOf: the chat's media address of a
// stored file (the step icons), as the chat shows them.
function profileView(db, profile, viewer, urlOf) {
  const base = `/api/members/${encodeURIComponent(profile.username)}/picture`;
  // The version in the address: a new picture is a new address, so no page shows the old one.
  const version = encodeURIComponent(profile.pictureAt ?? '');
  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    memberSince: profile.createdAt,
    about: profile.about,
    picture: profile.pictureFile
      ? { full: `${base}/full?v=${version}`, thumb: `${base}/thumb?v=${version}` }
      : null,
    steps: shownSteps(stepsOfUser(db, profile.id), urlOf),
    canReceive: currentKeyId(db, profile.id) !== null,
    own: profile.id === viewer.id,
    // Only one's own: whether "Show my game results" is on (the account page's switch).
    ...(profile.id === viewer.id && { showGameResults: !profile.hideGameResults }),
  };
}

// The files a change took away, deleted once it is written (through the chat handle).
export const deleteFiles = (chat, files) => files.forEach((file) => chat.images.remove(file));

// chat: mountChat()'s handle (chat/mount.js), the only way into the chat area; gameResults:
// games/memberSummary.js's createGameResults.
export function memberProfileRoutes(db, config, chat, gameResults) {
  const router = express.Router();
  const shown = (req, res, next) => {
    const profile = findProfile(db, req.params.username);
    if (!profile || profile.locked) return sendError(res, 404, 'not_found', 'No such member.');
    req.profile = profile;
    next();
  };

  router.get('/:username', allow('member'), shown, (req, res) => {
    res.json({ ok: true, profile: profileView(db, req.profile, req.user, chat.images.url) });
  });

  router.get('/:username/games', allow('member'), shown, async (req, res) => {
    // Switched off: the games are not even asked.
    const games = req.profile.hideGameResults ? [] : await gameResults.cardsFor(req.profile.id);
    res.set('Cache-Control', 'private, no-store');
    res.json({ ok: true, games });
  });

  router.get('/:username/picture/:variant', allow('member'), shown, (req, res) => {
    const file = req.profile[VARIANTS[req.params.variant]];
    if (!Object.hasOwn(VARIANTS, req.params.variant) || !file) {
      return sendError(res, 404, 'not_found', 'No such picture.');
    }
    res.set('Cache-Control', 'private, no-store');
    res.type(req.profile.pictureMime);
    res.sendFile(path.join(config.mediaDir, file));
  });

  return router;
}

export function ownProfileRoutes(db, config, chat) {
  const router = express.Router();
  const perUser = makeLimiter(config.rateLimits.profileEdit, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  // The size limit is a setting: read per request (as the chat's uploads do).
  const rawFile = (req, res, next) => rawBody(chat.images.pictureMaxBytes())(req, res, next);

  router.put('/about', allow('member'), perUser, (req, res) => {
    const about = req.body?.about;
    const problem = validateAbout(about);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    setAbout(db, req.user.id, cleanAbout(about));
    res.json({ ok: true });
  });

  router.put('/game-results', allow('member'), perUser, (req, res) => {
    if (typeof req.body?.show !== 'boolean') {
      return sendError(res, 400, 'invalid_input', 'show must be true or false.');
    }
    setGameResultsShown(db, req.user.id, req.body.show);
    res.json({ ok: true });
  });

  router.post('/picture', allow('member'), perUser, rawFile, async (req, res) => {
    const picture = Buffer.isBuffer(req.body) ? await chat.images.storePicture(req.body) : null;
    if (!picture?.ok) {
      return sendError(res, 400, 'invalid_file', picture?.message ?? 'No picture was sent.');
    }
    deleteFiles(chat, setPicture(db, req.user.id, picture.stored));
    res.status(201).json({ ok: true });
  });

  router.delete('/picture', allow('member'), perUser, (req, res) => {
    deleteFiles(chat, removePicture(db, req.user.id));
    res.json({ ok: true });
  });

  return router;
}
