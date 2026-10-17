// ============================================================
// File:        routes.js
// Path:        server/src/keys/routes.js
// Project:     Seasonal Entertainment
// Description: /api/keys, members only, always the session's own account: the current key
//              (public key, sealed private key, optional recovery seal), creating the first key
//              pair, starting over with a new one, re-sealing the same private key after a
//              recovery, and setting or removing the recovery seal. Every value arrives sealed or
//              public; the server can open none of them. Creating, replacing or re-sealing the
//              key needs the current password again (its auth key; /check tells the browser
//              whether a password is right at all), so a taken-over session
//              alone cannot swap the keys others encrypt to. The recovery seal needs an unlocked
//              key in the browser, which the server cannot check (docs/CHAT.md).
// ============================================================

import express from 'express';
import {
  authKeyField,
  publicKeyField,
  saltField,
  sealedKeyField,
} from '../accounts/credentials.js';
import { provesPassword } from '../accounts/passwordProof.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { validBody } from '../http/validate.js';
import { currentKey, resealKey, setRecovery, storeNewKey } from './store.js';

export function keyRoutes(db, config) {
  const router = express.Router();
  // Failed password proofs, per account (the password-change limit, as for 2FA).
  const perUser = makeLimiter(config.rateLimits.passwordChange, {
    failedOnly: true,
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  // Validates the body and the password proof; the cleaned input, or null after answering.
  async function provenInput(req, res, fields) {
    const input = validBody(req, res, { authKey: authKeyField('Password'), ...fields });
    if (!input) return null;
    if (!(await provesPassword(db, config, req.user.id, input.authKey))) {
      sendError(res, 401, 'invalid_credentials', 'The password is wrong.');
      return null;
    }
    return input;
  }

  router.get('/me', allow('member'), (req, res) => {
    res.json({ ok: true, key: currentKey(db, req.user.id) });
  });

  // Is this the current password? When the sealed key does not open, the browser asks before
  // offering recovery or "start over": a typo must never look like a lost key.
  router.post('/check', allow('member'), perUser, async (req, res) => {
    if (await provenInput(req, res, {})) res.json({ ok: true });
  });

  // The first key pair, made in the browser at registration or the first login after keys
  // were introduced.
  router.post('/', allow('member'), perUser, async (req, res) => {
    const input = await provenInput(req, res, {
      publicKey: publicKeyField,
      sealedPrivateKey: sealedKeyField,
    });
    if (!input) return;
    if (currentKey(db, req.user.id)) {
      return sendError(res, 409, 'key_exists', 'This account already has a key.');
    }
    const keyId = storeNewKey(db, req.user.id, input.publicKey, input.sealedPrivateKey);
    res.status(201).json({ ok: true, keyId });
  });

  // "Start over without my old messages": a new key pair replaces the current one; messages
  // made with the old one cannot be opened by this member any more.
  router.post('/replace', allow('member'), perUser, async (req, res) => {
    const input = await provenInput(req, res, {
      publicKey: publicKeyField,
      sealedPrivateKey: sealedKeyField,
    });
    if (!input) return;
    const keyId = storeNewKey(db, req.user.id, input.publicKey, input.sealedPrivateKey);
    res.json({ ok: true, keyId });
  });

  // The same private key sealed for the current password (after opening it with the recovery
  // code, when the password-sealed copy no longer opened).
  router.put('/sealed', allow('member'), perUser, async (req, res) => {
    const input = await provenInput(req, res, { sealedPrivateKey: sealedKeyField });
    if (!input) return;
    if (!resealKey(db, req.user.id, input.sealedPrivateKey)) {
      return sendError(res, 404, 'no_key', 'This account has no key yet.');
    }
    res.json({ ok: true });
  });

  // A new recovery seal replaces the old one: the old code stops working.
  router.put('/recovery', allow('member'), (req, res) => {
    const input = validBody(req, res, { salt: saltField, sealed: sealedKeyField });
    if (!input) return;
    if (!setRecovery(db, req.user.id, input)) {
      return sendError(res, 404, 'no_key', 'This account has no key yet.');
    }
    res.json({ ok: true });
  });

  router.delete('/recovery', allow('member'), (req, res) => {
    setRecovery(db, req.user.id, null);
    res.json({ ok: true });
  });

  return router;
}
