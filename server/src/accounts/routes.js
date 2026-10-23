// ============================================================
// File:        routes.js
// Path:        server/src/accounts/routes.js
// Project:     Seasonal Entertainment
// Description: /api/auth: current session (with the public site settings), registration (while
//              the "Registration open" setting is on), logout, own password change (login:
//              loginRoutes.js). No password ever arrives here: registration and password change
//              carry the auth key the browser derived and its salt (docs/AUTH.md, "Login key
//              split"); the server stores bcrypt of the auth key. The password rules are checked in
//              the browser (shared/accountRules.js). A password change also carries the private key
//              sealed again with the new wrapping key (keys/), stored in the same transaction as
//              the new verifier. Logout and password change also close the affected chat sockets
//              (chat/mount.js); logout also ends the member's embed tokens (embed/tokens.js). PUT
//              /api/auth/privacy: the member's own "Show when I'm online" and "Link previews in
//              direct messages"; PUT /api/auth/notifications: which browser notifications they want
//              (a mention, a new direct message, the weekly recap).
// ============================================================

import express from 'express';
import { revokeUserTokens } from '../embed/tokens.js';
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
import { getSetting, publicSettings } from '../settings/store.js';
import { twoFactorStatus } from '../twofa/gate.js';
import { resealKey } from '../keys/store.js';
import { authKeyField, optional, saltField, sealedKeyField } from './credentials.js';
import { loginRoutes } from './loginRoutes.js';
import { provesPassword } from './passwordProof.js';
import { hashPassword } from './passwords.js';
import {
  DuplicateAccountError,
  createUser,
  publicUser,
  setPasswordHash,
  setSwitches,
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

  // The settings every visitor's browser needs (shared/siteSettings.js) travel with it.
  router.get('/session', allow('public'), (req, res) => {
    res.json({ ok: true, user: req.user ? view(req.user) : null, settings: publicSettings(db) });
  });

  router.post('/register', allow('public'), registerLimiter, async (req, res) => {
    // The "Registration open" setting; the first admin's bootstrap (bootstrap.js) is separate.
    if (!getSetting(db, 'accounts.registrationOpen')) {
      return sendError(res, 403, 'registration_closed', 'Registration is closed at the moment.');
    }
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
    // Logging out on the site also ends this member's chat on approved foreign sites.
    revokeUserTokens(db, req.user.id);
    chatSessions.embedRevoked({ userId: req.user.id });
    await endSession(req);
    res.clearCookie(cookieName(config), { path: '/' });
    res.json({ ok: true });
  });

  // Own password only: the account comes from the session, never from the body. The browser
  // proves the current password with its auth key and sends the new salt and auth key, and
  // the private key re-sealed for the new password (absent when it had none it could open).
  router.post('/password', allow('member'), passwordLimiter, async (req, res) => {
    const input = validBody(req, res, {
      currentAuthKey: authKeyField('Current password'),
      newSalt: saltField,
      newAuthKey: authKeyField('New password'),
      sealedPrivateKey: optional(sealedKeyField),
    });
    if (!input) return;
    if (!(await provesPassword(db, config, req.user.id, input.currentAuthKey))) {
      return sendError(res, 401, 'invalid_credentials', 'The current password is wrong.');
    }
    const newHash = await hashPassword(input.newAuthKey, config.bcryptCost);
    // Verifier and sealed key change together, or neither does.
    const epoch = db.transaction(() => {
      if (input.sealedPrivateKey) resealKey(db, req.user.id, input.sealedPrivateKey);
      return setPasswordHash(db, req.user.id, newHash, input.newSalt);
    })();
    // Every other session of this account ends; this one is re-stamped and stays.
    await restampSession(req, epoch);
    chatSessions.accountChanged(req.user.id, req.sessionID);
    res.json({ ok: true });
  });

  // The member's own privacy switches, any of them per request (the account comes from the
  // session): "Show when I'm online" takes effect at once (open chat lists hear "presence"
  // and reload); "Link previews in direct messages" is read by the member's browser.
  // Validates switches named in `names` (any of them, at least one): the input, or null after
  // answering.
  function switchInput(req, res, names) {
    const flag = (name) => (v) =>
      v === undefined || typeof v === 'boolean' ? null : `${name} must be true or false.`;
    const input = validBody(req, res, Object.fromEntries(names.map((n) => [n, flag(n)])));
    if (!input) return null;
    if (names.every((n) => input[n] === undefined)) {
      sendError(res, 400, 'invalid_input', 'Name a setting to change.');
      return null;
    }
    return input;
  }

  router.put('/privacy', allow('member'), (req, res) => {
    const input = switchInput(req, res, ['showOnline', 'dmLinkPreviews']);
    if (!input) return;
    setSwitches(db, req.user.id, input);
    if (input.showOnline !== undefined) chatSessions.presenceChanged();
    res.json({ ok: true });
  });

  // Which browser notifications the member wants (docs/CHAT.md, "Notifications"); the browser's
  // own permission is asked for there, separately.
  router.put('/notifications', allow('member'), (req, res) => {
    const input = switchInput(req, res, ['notifyMentions', 'notifyDirect', 'notifyRecap']);
    if (!input) return;
    setSwitches(db, req.user.id, input);
    res.json({ ok: true });
  });

  return router;
}
