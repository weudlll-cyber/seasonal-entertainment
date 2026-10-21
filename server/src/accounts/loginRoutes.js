// ============================================================
// File:        loginRoutes.js
// Path:        server/src/accounts/loginRoutes.js
// Project:     Seasonal Entertainment
// Description: Logging in (docs/AUTH.md, "Login key split"). POST /api/auth/prelogin gives
//              the browser the salt to derive its keys with (a deterministic fake one for
//              unknown names: same shape, so it reveals nothing); POST /api/auth/login takes
//              the derived auth key, never the password. Wrong name and wrong secret answer the
//              same 401; both routes share the login rate limits (failed attempts per IP and
//              per username). Accounts with 2FA finish at POST /api/2fa/login. (The one-time
//              legacy login for accounts from before the key split was removed in SE-NIGHT-2:
//              no such account existed any more.)
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { startSession } from '../http/session.js';
import { required, validBody } from '../http/validate.js';
import { beginSecondFactor } from '../twofa/routes.js';
import { isTwoFactorEnabled } from '../twofa/store.js';
import { authKeyField, fakeSalt } from './credentials.js';
import { verifyPassword } from './passwords.js';
import { findKdfSalt, findLoginByUsername } from './userStore.js';

const wrongCredentials = (res) =>
  sendError(res, 401, 'invalid_credentials', 'Wrong username or password.');

// view(user): what the client sees about the signed-in account (routes.js).
export function loginRoutes(db, config, view) {
  const router = express.Router();
  const limits = config.rateLimits;
  const perIp = makeLimiter(limits.login, { failedOnly: true });
  const saltsPerIp = makeLimiter(limits.prelogin);
  // Also per username, so many addresses cannot keep trying one account. Keyed on the name as
  // typed (case-insensitive, like usernames), existing or not, so a 429 reveals nothing.
  const perName = makeLimiter(limits.loginAccount, {
    failedOnly: true,
    keyGenerator: (req) => {
      const name = req.body?.username;
      return `login:${typeof name === 'string' ? name.toLowerCase() : ''}`;
    },
  });

  // The secret was right: refuse a locked account, start the 2FA step, or log in.
  async function finish(req, res, user) {
    // Only someone who knows the password learns that the account is locked.
    if (user.locked) return sendError(res, 403, 'account_locked', 'This account is locked.');
    if (isTwoFactorEnabled(db, user.id)) {
      await beginSecondFactor(req, user);
      return res.json({ ok: true, twoFactorRequired: true });
    }
    await startSession(req, user);
    res.json({ ok: true, user: view(user) });
  }

  // Same limiters as the login itself: while a name or address is blocked from logging in,
  // it gets no salts either. Answers never fail, so they never count towards those; their
  // own per-IP limit counts every request.
  router.post('/prelogin', allow('public'), saltsPerIp, perIp, perName, (req, res) => {
    const input = validBody(req, res, { username: required('Username', 100) });
    if (!input) return;
    res.json({
      ok: true,
      salt: findKdfSalt(db, input.username) ?? fakeSalt(config.sessionSecret, input.username),
    });
  });

  router.post('/login', allow('public'), perIp, perName, async (req, res) => {
    const input = validBody(req, res, {
      username: required('Username', 100),
      authKey: authKeyField('Password'),
    });
    if (!input) return;
    const found = findLoginByUsername(db, input.username);
    if (!(await verifyPassword(input.authKey, found?.passwordHash, config.bcryptCost))) {
      return wrongCredentials(res);
    }
    await finish(req, res, found.user);
  });

  return router;
}
