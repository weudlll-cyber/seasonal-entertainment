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
//              A message may carry the sender's encrypted file upload (fileId; directFiles/:
//              the file's key, name and type travel inside the ciphertext, the server only
//              links the upload to the message for access and clean-up).
//              New messages are pushed to both members' open sockets, with the sender's name
//              (for the recipient's notification; never any text). A conversation is read
//              in pages of 100, newest first: ?before=<id> gives the 100 before that id, and
//              `more` says whether there are older ones still.
// ============================================================

import express from 'express';
import {
  CIPHERTEXT_MAX,
  NONCE_BYTES,
  boundedBase64,
  exactBytes,
} from '@seasonal-entertainment/shared/cryptoFormat.js';
import { attachDirectFile, findDirectFile } from '../directFiles/store.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { positiveInteger, queryId, validBody } from '../http/validate.js';
import { currentKeyId, publicKeysById } from '../keys/store.js';
import { partnerHandlers } from './directPartner.js';
import { markRead } from './readMarkers.js';
import { addDirect, directConversations, listDirect } from './directStore.js';
import { favouriteUsers } from './favouriteStore.js';
import { refuseSanctioned } from './sanctionRefusal.js';
import { activeSanction } from './store.js';
import { chatViewer } from './viewer.js';

const PAGE = 100;

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
        known ? { ...known, favourite: true } : { ...f, lastMessageAt: null, favourite: true }
      );
    }
    const conversations = [...byId.values()].map(({ id, username, ...rest }) => ({
      partner: { id, username, online: online.has(id) },
      ...rest,
    }));
    res.json({ ok: true, conversations });
  });

  router.get('/:id', allow('member'), ...partner, (req, res) => {
    // One more than a page: whether it came tells if there are older messages still.
    const beforeId = queryId(req.query.before);
    const page = listDirect(db, req.user.id, req.partner.id, { limit: PAGE + 1, beforeId });
    const more = page.length > PAGE;
    const messages = more ? page.slice(1) : page;
    const ids = messages.flatMap((m) => [m.senderKeyId, m.recipientKeyId]);
    const { id, username } = req.partner;
    res.json({
      ok: true,
      partner: { id, username, online: hub.onlineUserIds().has(id) },
      partnerKey: partnerKey(db, id),
      keys: publicKeysById(db, ids),
      messages,
      more,
    });
  });

  router.post('/:id', allow('member'), ...partner, (req, res) => {
    const input = validBody(req, res, {
      nonce: exactBytes('Nonce', NONCE_BYTES),
      ciphertext: boundedBase64('Message', CIPHERTEXT_MAX),
      senderKeyId: positiveInteger('Your key'),
      recipientKeyId: positiveInteger("The partner's key"),
      fileId: (v) => (v === undefined ? null : positiveInteger('The file')(v)),
    });
    if (!input) return;
    // The sender's own upload for this partner, not yet sent with another message.
    if (input.fileId !== undefined) {
      const file = findDirectFile(db, input.fileId);
      const own = file?.uploaderId === req.user.id && file.partnerId === req.partner.id;
      if (!own || file.attachedAt) {
        return sendError(res, 400, 'invalid_file', 'This file cannot be sent.');
      }
    }
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
    const { fileId, ...box } = input;
    const message = db.transaction(() => {
      const added = addDirect(db, { ...box, senderId: req.user.id, recipientId: req.partner.id });
      if (fileId !== undefined) {
        attachDirectFile(db, fileId, {
          senderId: req.user.id,
          recipientId: req.partner.id,
          messageId: added.id,
        });
      }
      return added;
    })();
    // The sender's name rides along for the recipient's notification (never any text).
    for (const userId of [req.user.id, req.partner.id]) {
      hub.sendToUser(userId, { type: 'direct', message, senderName: req.user.username });
    }
    res.status(201).json({ ok: true, message });
  });

  router.post('/:id/read', allow('member'), ...partner, (req, res) => {
    const input = validBody(req, res, { lastId: positiveInteger('lastId') });
    if (!input) return;
    markRead(db, req.user.id, 'direct', req.partner.id, input.lastId);
    // The member's other tabs recount.
    hub.sendToUser(req.user.id, { type: 'read' });
    res.json({ ok: true });
  });

  return router;
}
