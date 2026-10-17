// ============================================================
// File:        routes.js
// Path:        server/src/twofa/routes.js
// Project:     Seasonal Entertainment
// Description: /api/2fa: set up (secret + QR), enable with a first code (returns recovery
//              codes once), disable (password + second factor), and the second login step
//              for accounts with 2FA. beginSecondFactor() is called by the password login.
// ============================================================

import express from 'express';
import QRCode from 'qrcode';
import { verifyPassword } from '../accounts/passwords.js';
import { findPasswordHash, findUserById, publicUser } from '../accounts/userStore.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { startSession } from '../http/session.js';
import { required, validBody } from '../http/validate.js';
import { twoFactorStatus } from './gate.js';
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

// Password was right, the account has 2FA: remember who is half-way, not yet logged in.
export function beginSecondFactor(req, user) {
  req.session.pendingLogin = { userId: user.id, at: Date.now() };
  return new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
}

export function twoFactorRoutes(db, config) {
  const router = express.Router();
  const limit = config.rateLimits.twoFactor;
  const perUser = makeLimiter(limit, {
    failedOnly: true,
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  router.post('/setup', allow('member'), async (req, res) => {
    if (getTwoFactor(db, req.user.id)?.enabled) {
      return sendError(res, 409, 'already_enabled', 'Two-factor authentication is already on.');
    }
    const secret = generateSecret();
    savePendingSecret(db, req.user.id, secret);
    const url = otpauthUrl(secret, req.user.username, ISSUER);
    res.json({ ok: true, secret, otpauthUrl: url, qrCode: await QRCode.toDataURL(url) });
  });

  router.post('/enable', allow('member'), perUser, (req, res) => {
    const factor = getTwoFactor(db, req.user.id);
    if (!factor || factor.enabled) {
      return sendError(res, 409, 'no_pending_setup', 'Start the setup first.');
    }
    const step = matchStep(factor.secret, secondFactor(req.body).code, Date.now());
    if (step === null) return sendError(res, 400, 'invalid_code', 'That code is not valid.');
    res.json({ ok: true, recoveryCodes: enableTwoFactor(db, req.user.id, step) });
  });

  router.post('/disable', allow('member'), perUser, async (req, res) => {
    const input = validBody(req, res, { password: required('Password', 200) });
    if (!input) return;
    const hash = findPasswordHash(db, req.user.id);
    const passwordOk = await verifyPassword(input.password, hash, config.bcryptCost);
    if (!passwordOk || !acceptSecondFactor(db, req.user.id, secondFactor(req.body))) {
      return sendError(res, 401, 'invalid_credentials', 'Password or code is wrong.');
    }
    disableTwoFactor(db, req.user.id);
    res.json({ ok: true });
  });

  // Second login step. Public: the visitor is not logged in yet, only half-way.
  router.post(
    '/login',
    allow('public'),
    makeLimiter(limit, { failedOnly: true }),
    async (req, res) => {
      const pending = req.session.pendingLogin;
      if (!pending || Date.now() - pending.at > PENDING_LOGIN_MS) {
        return sendError(res, 401, 'login_expired', 'Please log in again.');
      }
      const user = findUserById(db, pending.userId);
      if (!user || user.locked || !acceptSecondFactor(db, user.id, secondFactor(req.body))) {
        return sendError(res, 401, 'invalid_code', 'That code is not valid.');
      }
      await startSession(req, user); // a fresh session id; the pending marker is gone
      res.json({ ok: true, user: { ...publicUser(user), ...twoFactorStatus(db, config, user) } });
    }
  );

  return router;
}
