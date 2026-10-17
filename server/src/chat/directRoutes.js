// ============================================================
// File:        directRoutes.js
// Path:        server/src/chat/directRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/chat/direct: end-to-end encrypted direct messages between members (never
//              guests; docs/CHAT.md, "Direct messages"). The browser encrypts with crypto_box
//              for the partner's current public key; the server stores and relays nonce and
//              ciphertext and names the key ids, and can read nothing. A member reaches only
//              their own conversations. Sending reuses the room rules: mute and ban, the
//              per-sender rate limit; the partner must have a key, and both key ids must be
//              the current ones (else 409 with the partner's current key, to encrypt again).
//              New messages are pushed to both members' open sockets.
// ============================================================

import express from 'express';
import {
  CIPHERTEXT_MAX,
  NONCE_BYTES,
  boundedBase64,
  exactBytes,
} from '@seasonal-entertainment/shared/cryptoFormat.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { positiveInteger, validBody } from '../http/validate.js';
import { currentKeyId, publicKeysById } from '../keys/store.js';
import { partnerHandlers } from './directPartner.js';
import { addDirect, directConversations, listDirect, markDirectRead } from './directStore.js';
import { favouriteUsers } from './favouriteStore.js';
import { refuseSanctioned } from './sanctionRefusal.js';
import { activeSanction } from './store.js';
import { chatViewer } from './viewer.js';

// The partner's current key for encrypting to them: { keyId, publicKey } or null.
function partnerKey(db, partnerId) {
  const keyId = currentKeyId(db, partnerId);
  return keyId ? { keyId, publicKey: publicKeysById(db, [keyId])[keyId] } : null;
}

// allowMessage: the per-sender rate limit shared with the rooms (mount.js).
export function directRoutes(db, hub, allowMessage) {
  const router = express.Router();
  const partner = partnerHandlers(db);

  // The conversation list: favourite members (even without messages yet) and everyone written
  // with; the client puts favourites first, then the most recent.
  router.get('/', allow('member'), (req, res) => {
    const online = hub.onlineUserIds();
    const byId = new Map();
    for (const c of directConversations(db, req.user.id)) {
      byId.set(c.id, { ...c, favourite: false });
    }
    for (const f of favouriteUsers(db, req.user.id)) {
      const known = byId.get(f.id);
      byId.set(
        f.id,
        known
          ? { ...known, favourite: true }
          : { ...f, lastMessageAt: null, unread: false, favourite: true }
      );
    }
    const conversations = [...byId.values()].map(({ id, username, ...rest }) => ({
      partner: { id, username, online: online.has(id) },
      ...rest,
    }));
    res.json({ ok: true, conversations });
  });

  router.get('/:id', allow('member'), ...partner, (req, res) => {
    const messages = listDirect(db, req.user.id, req.partner.id);
    const ids = messages.flatMap((m) => [m.senderKeyId, m.recipientKeyId]);
    const { id, username } = req.partner;
    res.json({
      ok: true,
      partner: { id, username, online: hub.onlineUserIds().has(id) },
      partnerKey: partnerKey(db, id),
      keys: publicKeysById(db, ids),
      messages,
    });
  });

  router.post('/:id', allow('member'), ...partner, (req, res) => {
    const input = validBody(req, res, {
      nonce: exactBytes('Nonce', NONCE_BYTES),
      ciphertext: boundedBase64('Message', CIPHERTEXT_MAX),
      senderKeyId: positiveInteger('Your key'),
      recipientKeyId: positiveInteger("The partner's key"),
    });
    if (!input) return;
    const sanction = activeSanction(db, chatViewer(req));
    if (sanction) return refuseSanctioned(res, sanction);
    const theirs = partnerKey(db, req.partner.id);
    if (!theirs) {
      return sendError(
        res,
        409,
        'no_key',
        `${req.partner.username} cannot receive private messages yet.`
      );
    }
    // Made for a key that is no longer current (on either side): encrypt again.
    if (
      theirs.keyId !== input.recipientKeyId ||
      currentKeyId(db, req.user.id) !== input.senderKeyId
    ) {
      return res.status(409).json({
        ok: false,
        error: 'key_changed',
        message: 'A security key changed. Please send again.',
        partnerKey: theirs,
      });
    }
    if (!allowMessage(`user:${req.user.id}`, false)) {
      return sendError(res, 429, 'too_many_messages', 'You are sending messages too fast.');
    }
    const message = addDirect(db, { ...input, senderId: req.user.id, recipientId: req.partner.id });
    for (const userId of [req.user.id, req.partner.id]) {
      hub.sendToUser(userId, { type: 'direct', message });
    }
    res.status(201).json({ ok: true, message });
  });

  router.post('/:id/read', allow('member'), ...partner, (req, res) => {
    const input = validBody(req, res, { lastId: positiveInteger('lastId') });
    if (!input) return;
    markDirectRead(db, req.user.id, req.partner.id, input.lastId);
    res.json({ ok: true });
  });

  return router;
}
