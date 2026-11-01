// ============================================================
// File:        deleteRoutes.js
// Path:        server/src/accounts/deleteRoutes.js
// Project:     Seasonal Entertainment
// Description: DELETE /api/auth/account: a member deletes their own account (docs/AUTH.md,
//              "Deleting an account"). The account comes from the session, never the body. It
//              needs the current password (its auth key, never the password) and, with 2FA on,
//              a code or recovery code; the last active admin is refused (409 last_admin).
//              Afterwards every socket of the account closes and this session ends.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { cookieName, endSession } from '../http/session.js';
import { validBody } from '../http/validate.js';
import { secondFactor } from '../twofa/routes.js';
import { acceptSecondFactor, isTwoFactorEnabled } from '../twofa/store.js';
import { authKeyField } from './credentials.js';
import { deleteAccount } from './deletion.js';
import { provesPassword } from './passwordProof.js';
import { LastAdminError } from './userAdmin.js';

// chatSessions, chatAccounts: the chat handle's sessions and accounts interfaces
// (chat/mount.js). failedLimiter: the password change's per-account limiter (routes.js), shared
// so that guesses on either route count together.
export function accountDeleteRoutes(db, config, { chatSessions, chatAccounts }, failedLimiter) {
  const router = express.Router();

  router.delete('/account', allow('member'), failedLimiter, async (req, res) => {
    const input = validBody(req, res, { authKey: authKeyField('Password') });
    if (!input) return;
    const user = req.user;
    // The same proofs as turning 2FA off (twofa/routes.js); the code is checked only after
    // the password, so a wrong password never uses up a code.
    const passwordOk = await provesPassword(db, config, user.id, input.authKey);
    const factorOk =
      passwordOk &&
      (!isTwoFactorEnabled(db, user.id) ||
        (await acceptSecondFactor(db, config.secretKey, user.id, secondFactor(req.body))));
    if (!factorOk) {
      return sendError(res, 401, 'invalid_credentials', 'Password or code is wrong.');
    }
    try {
      deleteAccount(db, chatAccounts, user);
    } catch (err) {
      if (!(err instanceof LastAdminError)) throw err;
      return sendError(
        res,
        409,
        'last_admin',
        'You are the last admin. Make someone else admin before deleting your account.'
      );
    }
    chatSessions.accountChanged(user.id);
    await endSession(req);
    res.clearCookie(cookieName(config), { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
