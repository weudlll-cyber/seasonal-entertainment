// ============================================================
// File:        loginRoutes.js
// Path:        server/src/accounts/loginRoutes.js
// Project:     Seasonal Entertainment
// Description: Logging in (docs/AUTH.md, "Login key split"). POST /api/auth/prelogin gives
//              the browser the salt to derive its keys with (a deterministic fake one for
//              unknown names: same shape, so it reveals nothing); POST /api/auth/login takes
//              the derived auth key, never the password. POST /api/auth/legacy-login serves
//              accounts from before the key split only: their password is checked one last
//              time against the old hash and, in the same request, replaced by the new salt
//              and auth-key verifier. Wrong name and wrong secret answer the same 401; both
//              routes share the login rate limits (failed attempts per IP and per username).
//              Accounts with 2FA finish at POST /api/2fa/login.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { startSession } from '../http/session.js';
import { required, validBody } from '../http/validate.js';
import { beginSecondFactor } from '../twofa/routes.js';
import { isTwoFactorEnabled } from '../twofa/store.js';
import { authKeyField, fakeSalt, saltField } from './credentials.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { findKdfSalt, findLoginByUsername, upgradeLegacyAccount } from './userStore.js';

const wrongCredentials = (res) =>
  sendError(res, 401, 'invalid_credentials', 'Wrong username or password.');

// view(user): what the client sees about the signed-in account (routes.js).
export function loginRoutes(db, config, view) {
  const router = express.Router();
  const limits = config.rateLimits;
  const perIp = makeLimiter(limits.login, { failedOnly: true });
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
  // it gets no salts either. Answers never fail, so they never count towards the limit.
  router.post('/prelogin', allow('public'), perIp, perName, (req, res) => {
    const input = validBody(req, res, { username: required('Username', 100) });
    if (!input) return;
    const found = findKdfSalt(db, input.username);
    // A legacy account has no salt yet: it gets a fake one too (its browser makes a new salt).
    res.json({
      ok: true,
      salt: found?.salt ?? fakeSalt(config.sessionSecret, input.username),
      legacy: found?.legacy ?? false,
    });
  });

  router.post('/login', allow('public'), perIp, perName, async (req, res) => {
    const input = validBody(req, res, {
      username: required('Username', 100),
      authKey: authKeyField('Password'),
    });
    if (!input) return;
    const found = findLoginByUsername(db, input.username);
    // A legacy account's hash is of the password, so an auth key never matches it here.
    if (!(await verifyPassword(input.authKey, found?.passwordHash, config.bcryptCost))) {
      return wrongCredentials(res);
    }
    await finish(req, res, found.user);
  });

  router.post('/legacy-login', allow('public'), perIp, perName, async (req, res) => {
    const input = validBody(req, res, {
      username: required('Username', 100),
      password: required('Password', 200),
      salt: saltField,
      authKey: authKeyField(),
    });
    if (!input) return;
    const found = findLoginByUsername(db, input.username);
    // Accounts that are not legacy never accept a password here (the dummy hash keeps the
    // response time the same).
    const hash = found?.legacy ? found.passwordHash : null;
    if (!(await verifyPassword(input.password, hash, config.bcryptCost))) {
      return wrongCredentials(res);
    }
    const verifier = await hashPassword(input.authKey, config.bcryptCost);
    upgradeLegacyAccount(db, found.user.id, verifier, input.salt);
    await finish(req, res, found.user);
  });

  return router;
}
