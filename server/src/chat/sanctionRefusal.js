// ============================================================
// File:        sanctionRefusal.js
// Path:        server/src/chat/sanctionRefusal.js
// Project:     Seasonal Entertainment
// Description: The one answer for a sender who is muted or banned in the chat, for room and
//              direct messages alike: 403 "muted" (with its end, in UTC) or "banned".
// ============================================================

import { sendError } from '../http/errors.js';

// sanction: { kind, until } from activeSanction() (store.js).
export function refuseSanctioned(res, sanction) {
  const until = sanction.until ? ` until ${sanction.until.slice(0, 16).replace('T', ' ')} UTC` : '';
  return sendError(
    res,
    403,
    sanction.kind === 'ban' ? 'banned' : 'muted',
    `You are ${sanction.kind === 'ban' ? 'banned from' : 'muted in'} the chat${until}.`
  );
}
