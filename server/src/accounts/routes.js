// ============================================================
// File:        routes.js
// Path:        server/src/accounts/routes.js
// Project:     Seasonal Entertainment
// Description: /api/auth: current session, registration, logout, own password change (login:
//              loginRoutes.js). No password ever arrives here: registration and password change
//              carry the auth key the browser derived and its salt (docs/AUTH.md, "Login key
//              split"); the server stores bcrypt of the auth key. The password rules are
//              checked in the browser (shared/accountRules.js). Logout and password change
//              also close the affected chat sockets (chat/mount.js).
// ============================================================

import express from 'express';
import {
  MINIMUM_AGE,
  validateEmail,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { cookieName, endSession, restampSession, startSession } from '../http/session.js';
import { mustBeTrue, validBody } from '../http/validate.js';
import { twoFactorStatus } from '../twofa/gate.js';
import { authKeyField, saltField } from './credentials.js';
import { loginRoutes } from './loginRoutes.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  DuplicateAccountError,
  createUser,
  findPasswordHash,
  publicUser,
  setPasswordHash,
} from './userStore.js';

// chatSessions: the chat handle's sessions interface (chat/mount.js).
export function accountRoutes(db, config, chatSessions) {
  const router = express.Router();
  const limits = config.rateLimits;
  // What the client sees about the signed-in account, including its 2FA state.
  const view = (user) => ({ ...publicUser(user), ...twoFactorStatus(db, config, user) });
  router.use(loginRoutes(db, config, view));
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
      salt: saltField,
      authKey: authKeyField('Password'),
      ageConfirmed: mustBeTrue(`Please confirm that you are at least ${MINIMUM_AGE} years old.`),
    });
    if (!input) return;
    try {
      const user = createUser(db, {
        username: input.username,
        email: input.email,
        passwordHash: await hashPassword(input.authKey, config.bcryptCost),
        kdfSalt: input.salt,
      });
      await startSession(req, user);
      res.status(201).json({ ok: true, user: view(user) });
    } catch (err) {
      if (!(err instanceof DuplicateAccountError)) throw err;
      sendError(res, 409, `${err.field}_taken`, `This ${err.field} is already registered.`);
    }
  });

  router.post('/logout', allow('member'), async (req, res) => {
    chatSessions.ended(req.sessionID);
    await endSession(req);
    res.clearCookie(cookieName(config), { path: '/' });
    res.json({ ok: true });
  });

  // Own password only: the account comes from the session, never from the body. The browser
  // proves the current password with its auth key and sends the new salt and auth key.
  router.post('/password', allow('member'), passwordLimiter, async (req, res) => {
    const input = validBody(req, res, {
      currentAuthKey: authKeyField('Current password'),
      newSalt: saltField,
      newAuthKey: authKeyField('New password'),
    });
    if (!input) return;
    const hash = findPasswordHash(db, req.user.id);
    if (!(await verifyPassword(input.currentAuthKey, hash, config.bcryptCost))) {
      return sendError(res, 401, 'invalid_credentials', 'The current password is wrong.');
    }
    const newHash = await hashPassword(input.newAuthKey, config.bcryptCost);
    // Every other session of this account ends; this one is re-stamped and stays.
    await restampSession(req, setPasswordHash(db, req.user.id, newHash, input.newSalt));
    chatSessions.accountChanged(req.user.id, req.sessionID);
    res.json({ ok: true });
  });

  return router;
}
