// ============================================================
// File:        routes.js
// Path:        server/src/twofa/routes.js
// Project:     Seasonal Entertainment
// Description: /api/2fa: set up (current password, proven by the browser's auth key; secret
//              + QR), enable with a first code (returns recovery codes once), disable (auth key
//              + second factor), and the second login step for accounts with 2FA. Turning 2FA
//              on or off ends every other session of the account (session epoch) and closes its
//              other chat sockets. beginSecondFactor() is called by the password login. The
//              secret is stored encrypted (secretBox.js) under SECRET_ENCRYPTION_KEY.
// ============================================================

import express from 'express';
import QRCode from 'qrcode';
import { authKeyField } from '../accounts/credentials.js';
import { provesPassword } from '../accounts/passwordProof.js';
import { bumpSessionEpoch, findUserById, publicUser } from '../accounts/userStore.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { restampSession, startSession } from '../http/session.js';
import { validBody } from '../http/validate.js';
import { twoFactorStatus } from './gate.js';
import { openSecret, sealSecret } from './secretBox.js';
import {
  acceptSecondFactor,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactor,
  savePendingSecret,
} from './store.js';
import { generateSecret, matchStep, otpauthUrl } from './totp.js';

const ISSUER = 'Seasonal Entertainment';
const PENDING_LOGIN_MS = 5 * 60_000;

// Either a 6-digit code or a recovery code, not both missing.
const secondFactor = (body) => ({
  code: typeof body?.code === 'string' ? body.code.trim() : undefined,
  recoveryCode: typeof body?.recoveryCode === 'string' ? body.recoveryCode : undefined,
});

// Password was right, the account has 2FA: remember who is half-way, not yet logged in. The
// epoch makes a password reset (or any other session end) in between void this step too.
export function beginSecondFactor(req, user) {
  req.session.pendingLogin = { userId: user.id, at: Date.now(), sessionEpoch: user.sessionEpoch };
  return new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
}

// chatSessions: the chat handle's sessions interface (chat/mount.js).
export function twoFactorRoutes(db, config, chatSessions) {
  const router = express.Router();
  const limit = config.rateLimits.twoFactor;
  const perUser = makeLimiter(limit, {
    failedOnly: true,
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  // The current password, as the auth key the browser derived from it (never the password).
  const passwordMatches = (req, authKey) => provesPassword(db, config, req.user.id, authKey);
  const passwordInput = { authKey: authKeyField('Password') };

  // Every other session of the account ends; this one is re-stamped and stays (as after an
  // own password change).
  async function endOtherSessions(req) {
    await restampSession(req, bumpSessionEpoch(db, req.user.id));
    chatSessions.accountChanged(req.user.id, req.sessionID);
  }

  // Starting (or restarting) the setup reveals a new secret: only with the current password,
  // so a taken-over session cannot enrol an authenticator of its own.
  router.post('/setup', allow('member'), perUser, async (req, res) => {
    const input = validBody(req, res, passwordInput);
    if (!input) return;
    if (!(await passwordMatches(req, input.authKey))) {
      return sendError(res, 401, 'invalid_credentials', 'The password is wrong.');
    }
    if (getTwoFactor(db, req.user.id)?.enabled) {
      return sendError(res, 409, 'already_enabled', 'Two-factor authentication is already on.');
    }
    const secret = generateSecret();
    savePendingSecret(db, req.user.id, await sealSecret(secret, config.secretKey));
    const url = otpauthUrl(secret, req.user.username, ISSUER);
    res.json({ ok: true, secret, otpauthUrl: url, qrCode: await QRCode.toDataURL(url) });
  });

  router.post('/enable', allow('member'), perUser, async (req, res) => {
    const factor = getTwoFactor(db, req.user.id);
    if (!factor || factor.enabled) {
      return sendError(res, 409, 'no_pending_setup', 'Start the setup first.');
    }
    const secret = await openSecret(factor.secret, config.secretKey, req.user.id);
    const step =
      secret === null ? null : matchStep(secret, secondFactor(req.body).code, Date.now());
    if (step === null) return sendError(res, 400, 'invalid_code', 'That code is not valid.');
    const recoveryCodes = enableTwoFactor(db, req.user.id, step);
    await endOtherSessions(req);
    res.json({ ok: true, recoveryCodes });
  });

  router.post('/disable', allow('member'), perUser, async (req, res) => {
    const input = validBody(req, res, passwordInput);
    if (!input) return;
    const passwordOk = await passwordMatches(req, input.authKey);
    const factor = secondFactor(req.body);
    if (!passwordOk || !(await acceptSecondFactor(db, config.secretKey, req.user.id, factor))) {
      return sendError(res, 401, 'invalid_credentials', 'Password or code is wrong.');
    }
    disableTwoFactor(db, req.user.id);
    await endOtherSessions(req);
    res.json({ ok: true });
  });

  // Second login step. Public: the visitor is not logged in yet, only half-way.
  router.post(
    '/login',
    allow('public'),
    makeLimiter(limit, { failedOnly: true }),
    async (req, res) => {
      const pending = req.session.pendingLogin;
      const user = pending && findUserById(db, pending.userId);
      const expired = !pending || Date.now() - pending.at > PENDING_LOGIN_MS;
      if (expired || (user && user.sessionEpoch !== pending.sessionEpoch)) {
        return sendError(res, 401, 'login_expired', 'Please log in again.');
      }
      const accepted =
        user && (await acceptSecondFactor(db, config.secretKey, user.id, secondFactor(req.body)));
      if (!user || user.locked || !accepted) {
        return sendError(res, 401, 'invalid_code', 'That code is not valid.');
      }
      await startSession(req, user); // a fresh session id; the pending marker is gone
      res.json({ ok: true, user: { ...publicUser(user), ...twoFactorStatus(db, config, user) } });
    }
  );

  return router;
}
