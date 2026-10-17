// ============================================================
// File:        routes.js
// Path:        server/src/accounts/routes.js
// Project:     Seasonal Entertainment
// Description: /api/auth: current session, registration, login, logout, own password
//              change. Wrong username and wrong password answer the same 401 (race game rule).
//              Logout and password change also close the affected chat sockets (chat/hub.js).
//              Accounts with 2FA finish logging in at POST /api/2fa/login.
// ============================================================

import express from 'express';
import {
  MINIMUM_AGE,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { cookieName, endSession, restampSession, startSession } from '../http/session.js';
import { mustBeTrue, required, validBody } from '../http/validate.js';
import { twoFactorStatus } from '../twofa/gate.js';
import { beginSecondFactor } from '../twofa/routes.js';
import { isTwoFactorEnabled } from '../twofa/store.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  DuplicateAccountError,
  createUser,
  findLoginByUsername,
  findPasswordHash,
  publicUser,
  setPasswordHash,
} from './userStore.js';

export function accountRoutes(db, config, hub) {
  const router = express.Router();
  const limits = config.rateLimits;
  // What the client sees about the signed-in account, including its 2FA state.
  const view = (user) => ({ ...publicUser(user), ...twoFactorStatus(db, config, user) });
  const loginLimiter = makeLimiter(limits.login, { failedOnly: true });
  const registerLimiter = makeLimiter(limits.register);
  // Keyed on the account, not the IP (see rateLimit.js).
  const passwordLimiter = makeLimiter(limits.passwordChange, {
    failedOnly: true,
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  router.get('/session', allow('public'), (req, res) => {
    res.json({ ok: true, user: req.user ? view(req.user) : null });
  });

  router.post('/register', allow('public'), registerLimiter, async (req, res) => {
    const input = validBody(req, res, {
      username: validateUsername,
      email: validateEmail,
      password: validatePassword,
      ageConfirmed: mustBeTrue(`Please confirm that you are at least ${MINIMUM_AGE} years old.`),
    });
    if (!input) return;
    try {
      const user = createUser(db, {
        username: input.username,
        email: input.email,
        passwordHash: await hashPassword(input.password, config.bcryptCost),
      });
      await startSession(req, user);
      res.status(201).json({ ok: true, user: view(user) });
    } catch (err) {
      if (!(err instanceof DuplicateAccountError)) throw err;
      sendError(res, 409, `${err.field}_taken`, `This ${err.field} is already registered.`);
    }
  });

  router.post('/login', allow('public'), loginLimiter, async (req, res) => {
    const input = validBody(req, res, {
      username: required('Username', 100),
      password: required('Password', 200),
    });
    if (!input) return;
    const found = findLoginByUsername(db, input.username);
    const ok = await verifyPassword(input.password, found?.passwordHash, config.bcryptCost);
    if (!ok) return sendError(res, 401, 'invalid_credentials', 'Wrong username or password.');
    // Only someone who knows the password learns that the account is locked.
    if (found.user.locked) {
      return sendError(res, 403, 'account_locked', 'This account is locked.');
    }
    if (isTwoFactorEnabled(db, found.user.id)) {
      await beginSecondFactor(req, found.user);
      return res.json({ ok: true, twoFactorRequired: true });
    }
    await startSession(req, found.user);
    res.json({ ok: true, user: view(found.user) });
  });

  router.post('/logout', allow('member'), async (req, res) => {
    hub.disconnectSession(req.sessionID);
    await endSession(req);
    res.clearCookie(cookieName(config), { path: '/' });
    res.json({ ok: true });
  });

  // Own password only: the account comes from the session, never from the body.
  router.post('/password', allow('member'), passwordLimiter, async (req, res) => {
    const input = validBody(req, res, {
      currentPassword: required('Current password', 200),
      newPassword: validatePassword,
    });
    if (!input) return;
    const hash = findPasswordHash(db, req.user.id);
    if (!(await verifyPassword(input.currentPassword, hash, config.bcryptCost))) {
      return sendError(res, 401, 'invalid_credentials', 'The current password is wrong.');
    }
    const newHash = await hashPassword(input.newPassword, config.bcryptCost);
    // Every other session of this account ends; this one is re-stamped and stays.
    await restampSession(req, setPasswordHash(db, req.user.id, newHash));
    hub.disconnectUser(req.user.id, req.sessionID);
    res.json({ ok: true });
  });

  return router;
}
