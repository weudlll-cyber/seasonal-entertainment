// ============================================================
// File:        messageInput.js
// Path:        server/src/chat/messageInput.js
// Project:     Seasonal Entertainment
// Description: What a send request may contain: optional text plus at most one attachment,
//              and at least one of the two. Text: length rules, no links from guests, links
//              only as https://. Attachment (decided 2026-10-17): members only; a sticker or
//              GIF only as a library item id (active, in an active pack of that kind), never a
//              URL; a file only as the sender's own, not yet sent upload.
// ============================================================

import {
  containsLink,
  containsPlainHttpLink,
  validateMessage,
} from '@seasonal-entertainment/shared/chatRules.js';
import { sendError } from '../http/errors.js';
import { findSendableItem } from '../media/store.js';
import { isAttachable } from '../uploads/store.js';

const LIBRARY_KINDS = ['sticker', 'gif'];

// Request body: { body?: string, attachment?: { type: 'sticker' | 'gif', itemId } or
// { type: 'file', uploadId } }. Returns { kind, body, itemId, uploadId } (kind: the library
// attachment's kind, else 'text'); otherwise sends the error and returns null.
export function readMessageInput(req, res, db, viewer) {
  const refuse = (status, code, message) => {
    sendError(res, status, code, message);
    return null;
  };
  const raw = req.body?.body ?? '';
  if (typeof raw !== 'string') return refuse(400, 'invalid_input', 'The message must be text.');
  const body = raw.trim();
  const attachment = req.body?.attachment ?? null;
  if (!body && !attachment) return refuse(400, 'invalid_input', 'Message is empty.');

  if (body) {
    const problem = validateMessage(body);
    if (problem) return refuse(400, 'invalid_input', problem);
    if (!viewer.user && containsLink(body)) {
      return refuse(400, 'links_not_allowed', 'Guests cannot post links. Register to share links.');
    }
    if (containsPlainHttpLink(body)) {
      return refuse(400, 'https_only', 'Links must start with https://.');
    }
  }
  if (!attachment) return { kind: 'text', body, itemId: null, uploadId: null };

  if (!viewer.user) return refuse(403, 'members_only', 'Log in to send stickers, GIFs and files.');
  const { type, itemId, uploadId } = typeof attachment === 'object' ? attachment : {};
  if (type === 'file') {
    // Only the sender's own upload, not yet sent with another message.
    if (!Number.isInteger(uploadId) || !isAttachable(db, uploadId, viewer.user.id)) {
      return refuse(400, 'unknown_file', 'This file is not available.');
    }
    return { kind: 'text', body, itemId: null, uploadId };
  }
  if (!LIBRARY_KINDS.includes(type)) return refuse(400, 'invalid_input', 'Unknown attachment.');
  if (!Number.isInteger(itemId) || !findSendableItem(db, itemId, type)) {
    return refuse(400, 'unknown_media', 'This sticker or GIF is not available.');
  }
  return { kind: type, body, itemId, uploadId: null };
}
