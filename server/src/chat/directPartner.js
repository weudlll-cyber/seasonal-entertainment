// ============================================================
// File:        directPartner.js
// Path:        server/src/chat/directPartner.js
// Project:     Seasonal Entertainment
// Description: The other member of a direct conversation, named by :id in a route: loaded after
//              allow() (loadById: no probing of ids by those without access) into req.partner,
//              and never the member themselves. Shared by the direct-message and report routes.
// ============================================================

import { findUserById } from '../accounts/userStore.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';

// The handlers to put after allow('member').
export function partnerHandlers(db) {
  return [
    loadById((id) => findUserById(db, id), 'partner', 'member'),
    (req, res, next) =>
      req.partner.id === req.user.id
        ? sendError(res, 400, 'invalid_input', 'You cannot write to yourself.')
        : next(),
  ];
}
