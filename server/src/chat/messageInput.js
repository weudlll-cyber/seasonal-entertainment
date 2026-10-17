// ============================================================
// File:        messageInput.js
// Path:        server/src/chat/messageInput.js
// Project:     Seasonal Entertainment
// Description: What a send request may contain. Text: length rules, and no links from guests.
//              Sticker or GIF (decided 2026-10-17): members only, and only a library item by
//              id that is active, in an active pack of that kind; never a URL.
// ============================================================

import { containsLink, validateMessage } from '@seasonal-entertainment/shared/chatRules.js';
import { sendError } from '../http/errors.js';
import { findSendableItem } from '../media/store.js';

// Returns { kind, body } or { kind, itemId }; otherwise sends the error and returns null.
export function readMessageInput(req, res, db, viewer) {
  const refuse = (status, code, message) => {
    sendError(res, status, code, message);
    return null;
  };
  const kind = req.body?.kind ?? 'text';
  if (kind === 'text') {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : req.body?.body;
    const problem = validateMessage(body);
    if (problem) return refuse(400, 'invalid_input', problem);
    if (!viewer.user && containsLink(body)) {
      return refuse(400, 'links_not_allowed', 'Guests cannot post links. Register to share links.');
    }
    return { kind, body };
  }
  if (kind !== 'sticker' && kind !== 'gif')
    return refuse(400, 'invalid_input', 'Unknown message kind.');
  if (!viewer.user) return refuse(403, 'members_only', 'Log in to send stickers and GIFs.');
  const { itemId } = req.body;
  if (!Number.isInteger(itemId) || !findSendableItem(db, itemId, kind)) {
    return refuse(400, 'unknown_media', 'This sticker or GIF is not available.');
  }
  return { kind, itemId };
}
