// ============================================================
// File:        embeddedRoutes.js
// Path:        server/src/games/embeddedRoutes.js
// Project:     Seasonal Entertainment
// Description: The site's side of the embedded games at /games/<slug> (games/embedded.js:
//              bingo, mini-games; docs/AUTH.md, "Embedded games"; decided 2026-11-02 for Bingo
//              and 2026-11-04 for Mini Games: inside this site players sign in only through this
//              site's login, delivered like the event bot's admin page). One mechanism for every
//              game: a slug not switched on (GAMES_EMBEDDED), or not in the list at all, answers
//              404; every answer is Cache-Control: no-store.
//              - GET /api/games/<slug>/authorize: the game's sign-in route asks it through
//                nginx's auth_request (or Caddy's forward_auth) with the browser's cookie,
//                X-Original-Method and Origin. A state-changing original method needs this
//                site's Origin (the CSRF rule, http/csrf.js), an unknown or missing one is
//                refused (403, fail closed). Then always 204: a signed-in account in good
//                standing gets the X-Acting-User-* headers (memberHeaders); anyone else, guests
//                watching included (decided 2026-11-04), X-Acting-Guest: true alone. Never 401,
//                never audited. Any other method on the route itself: 405.
//              - GET /api/games/<slug>/account-changes?since=<cursor>: the account changes the
//                games must act on (accounts/accountChanges.js; one feed, each game with its own
//                cursor), for the game over the site's local port only (the site's nginx denies
//                these paths, its Caddy answers 404); only with X-Games-Sync-Token equal to the
//                installer's token, one for all games (401 otherwise), rate-limited per game.
// ============================================================

import express from 'express';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { accountChangesSince } from '../accounts/accountChanges.js';
import { shownSteps, stepsOfUser } from '../discord/steps.js';
import { allow } from '../http/access.js';
import { isStateChanging, originRefusal } from '../http/csrf.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { tokenMatches } from '../http/tokenMatches.js';

// Methods that only read.
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

// base64url of compact JSON (the game decodes X-Acting-User-Steps this way).
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

// The headers of a signed-in account in good standing: its never-reused id
// (accounts/accountIds.js), name, role, whether it may host matches ("may start games",
// admins always; decided 2026-11-04), and its Discord steps as this site shows them: the highest
// per ladder, at most three, each icon a public site address or null (decided 2026-11-04).
// urlOf: the chat handle's media address (chat.images.url), as the account page uses it.
export function memberHeaders(db, user, urlOf) {
  return {
    'X-Acting-User-Id': String(user.id),
    'X-Acting-User': user.username,
    'X-Acting-User-Roles': user.role,
    // Every account in good standing counts as confirmed for the leaderboard (decided
    // 2026-11-04); the header's name is the game's.
    'X-Acting-User-Email-Verified': 'true',
    'X-Acting-User-Can-Host': String(user.canStartGames || user.role === 'admin'),
    'X-Acting-User-Steps': base64url(shownSteps(stepsOfUser(db, user.id), urlOf)),
  };
}

// Mounted at /api/games, before the games list (games/routes.js). urlOf: the chat handle's media
// address (chat.images.url), for the steps' icons.
export function embeddedGameRoutes(db, config, urlOf) {
  const router = express.Router();
  // One limiter per game: each game may read as often as Bingo alone could.
  const feedLimits = Object.fromEntries(
    config.games.embedded.map((slug) => [slug, makeLimiter(config.rateLimits.gamesFeed)])
  );

  // Before everything, so even a refusal is never cached; a game switched off (or none of the
  // list: the switched-on slugs are all from it) does not exist here.
  router.param('game', (_req, res, next, game) => {
    res.set('Cache-Control', 'no-store');
    if (!config.games.embedded.includes(game)) {
      return sendError(res, 404, 'not_found', 'No such API endpoint.');
    }
    next();
  });

  router.all('/:game/authorize', allow('public'), (req, res, next) => {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'GET only.');
    next();
  });

  // allow('public'): guests are let in to watch. req.user is the site's own answer: no
  // session, a locked account's ended session (http/session.js) and a member who must still
  // set up 2FA (twofa/gate.js) all come as null; staff without their 2FA carry staffRefusal.
  router.get('/:game/authorize', allow('public'), (req, res) => {
    const method = (req.get('x-original-method') ?? '').toUpperCase();
    if (isStateChanging(method)) {
      // The browser's own Origin, carried by nginx: a foreign page cannot act as the visitor.
      const refusal = originRefusal(req, config);
      if (refusal) return sendError(res, 403, refusal.code, refusal.message);
    } else if (!READS.has(method)) {
      // Fail closed: without nginx's method the request could be a change nobody checked.
      return sendError(res, 403, 'method_unknown', 'Request refused: unknown method.');
    }
    const member = req.user && !req.staffRefusal && roleAtLeast(req.user.role, 'member');
    res.set(member ? memberHeaders(db, req.user, urlOf) : { 'X-Acting-Guest': 'true' });
    res.status(204).end();
  });

  // Public as far as the site's sessions go: the sync token is the game's whole proof.
  const feedLimit = (req, res, next) => feedLimits[req.params.game](req, res, next);
  router.get('/:game/account-changes', allow('public'), feedLimit, (req, res) => {
    if (!tokenMatches(req.get('x-games-sync-token'), config.games.syncToken)) {
      return sendError(res, 401, 'token_invalid', 'A valid X-Games-Sync-Token is required.');
    }
    const since = req.query.since ?? '0';
    if (typeof since !== 'string' || !/^\d{1,15}$/.test(since)) {
      return sendError(
        res,
        400,
        'invalid_cursor',
        'since must be a cursor from an earlier answer.'
      );
    }
    res.json(accountChangesSince(db, Number(since)));
  });

  return router;
}
