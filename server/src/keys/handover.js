// ============================================================
// File:        handover.js
// Path:        server/src/keys/handover.js
// Project:     Seasonal Entertainment
// Description: Unlocking a new device from one where private messages are already unlocked
//              (docs/AUTH.md, "Unlock on another device", decided 2026-10-22). The new device
//              (locked) sends a one-time public key: POST /api/keys/handover. The request is
//              valid 5 minutes, one at a time per account, kept in memory only, and goes as a
//              personal event ("keyRequest") over the live connection to the account's own
//              open pages; one where the key is unlocked asks the member, showing the code that
//              comes from the one-time key (shared/crypto.js, handoverCode) as the new device
//              does. Confirm sends the private key sealed to that one-time key (the server
//              cannot open it); the requesting session collects it once
//              (GET /api/keys/handover/:id) and it is deleted. Reject, expiry or a wrong
//              request do nothing. Request, confirm and reject are audited, never with keys.
// ============================================================

import { randomBytes } from 'node:crypto';
import express from 'express';
import { DEVICE_SEALED_BYTES, exactBytes } from '@seasonal-entertainment/shared/cryptoFormat.js';
import { publicKeyField } from '../accounts/credentials.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { validBody } from '../http/validate.js';
import { currentKey } from './store.js';

export const HANDOVER_VALID_MS = 5 * 60_000;

// notifyMember(userId, event): the chat's personal events (chat/mount.js); now: the clock
// (tests move it).
export function keyHandoverRoutes(db, config, notifyMember, { now = () => Date.now() } = {}) {
  const router = express.Router();
  const requests = new Map(); // userId -> { id, sessionId, publicKey, expiresAt, status, sealed }
  const perUser = makeLimiter(config.rateLimits.keyHandover, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const audit = (req, action) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'user',
      targetId: req.user.id,
      before: null,
      after: null,
    });

  // The account's request by id while it is still valid; an expired one is dropped.
  function live(userId, id) {
    const request = requests.get(userId);
    if (!request || request.id !== id) return null;
    if (now() > request.expiresAt) {
      requests.delete(userId);
      return null;
    }
    return request;
  }

  router.post('/handover', allow('member'), perUser, (req, res) => {
    const input = validBody(req, res, { publicKey: publicKeyField });
    if (!input) return;
    // A device of a cookie session only (the embedded chat has its own login popup).
    if (!req.sessionID) return sendError(res, 403, 'not_allowed', 'Not from here.');
    if (!currentKey(db, req.user.id)) {
      return sendError(res, 409, 'no_key', 'There is no key to hand over yet.');
    }
    // Only a request still waiting for an answer blocks another device's.
    const open = requests.get(req.user.id);
    const waiting = open?.status === 'pending' && now() <= open.expiresAt;
    if (waiting && open.sessionId !== req.sessionID) {
      return sendError(res, 409, 'request_pending', 'Another device is waiting already.');
    }
    const request = {
      id: randomBytes(16).toString('hex'),
      sessionId: req.sessionID,
      publicKey: input.publicKey,
      expiresAt: now() + HANDOVER_VALID_MS,
      status: 'pending',
      sealed: null,
    };
    requests.set(req.user.id, request);
    audit(req, 'keys.handover_request');
    const { id, publicKey, expiresAt } = request;
    notifyMember(req.user.id, { type: 'keyRequest', id, publicKey, expiresAt });
    res.status(201).json({ ok: true, id, expiresAt });
  });

  // The requesting session only: pending, rejected, or (once) the sealed key.
  router.get('/handover/:id', allow('member'), (req, res) => {
    const request = live(req.user.id, req.params.id);
    if (!request || request.sessionId !== req.sessionID) {
      return sendError(res, 404, 'not_found', 'No such request (it may have expired).');
    }
    if (request.status === 'pending') return res.json({ ok: true, status: 'pending' });
    requests.delete(req.user.id); // answered: delivered once, then gone
    res.json({ ok: true, status: request.status, sealed: request.sealed ?? undefined });
  });

  // Another session of the same account answers a pending request.
  function answer(status) {
    return (req, res) => {
      const request = live(req.user.id, req.params.id);
      if (!request || request.status !== 'pending' || request.sessionId === req.sessionID) {
        return sendError(res, 404, 'not_found', 'No such request (it may have expired).');
      }
      let sealed = null;
      if (status === 'confirmed') {
        const input = validBody(req, res, {
          sealed: exactBytes('Sealed key', DEVICE_SEALED_BYTES),
        });
        if (!input) return;
        sealed = input.sealed;
      }
      Object.assign(request, { status, sealed });
      audit(req, status === 'confirmed' ? 'keys.handover_confirm' : 'keys.handover_reject');
      res.json({ ok: true });
    };
  }
  router.post('/handover/:id/confirm', allow('member'), answer('confirmed'));
  router.post('/handover/:id/reject', allow('member'), answer('rejected'));

  return router;
}
