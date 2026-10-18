// ============================================================
// File:        loadById.js
// Path:        server/src/http/loadById.js
// Project:     Seasonal Entertainment
// Description: Loads the record a route's :id names, as a route handler placed AFTER
//              allow(...). (router.param would run before allow(), so a caller without access
//              could tell existing ids from missing ones by the 404.)
// ============================================================

import { sendError } from './errors.js';

// find(id) returns the record or nothing; it lands in req[key]. Non-numeric ids are missing.
export function loadById(find, key, label, param = 'id') {
  return (req, res, next) => {
    const id = req.params[param];
    const record = /^\d+$/.test(id) ? find(Number(id)) : null;
    if (!record) return sendError(res, 404, 'not_found', `No such ${label}.`);
    req[key] = record;
    next();
  };
}
