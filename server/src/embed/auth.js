// ============================================================
// File:        auth.js
// Path:        server/src/embed/auth.js
// Project:     Seasonal Entertainment
// Description: Requests from the chat embedded on an approved foreign site carry an embed
//              token (tokens.js) in the X-Embed-Token header instead of a cookie (third-party
//              cookies are blocked there). Such a request acts as the token's member, but only
//              on the chat's member routes listed below: rooms and direct messages (read,
//              write, read markers, mutes, reports), unread counts, favourites, the member
//              search and the sticker/GIF library. Everything else — uploads, moderation,
//              keys, account, 2FA, admin, calls — answers 403. Requests without the header
//              keep cookie sessions exactly as before; CSRF rules are unaffected.
// ============================================================

import { sendError } from '../http/errors.js';
import { findActiveToken } from './tokens.js';

export const EMBED_TOKEN_HEADER = 'X-Embed-Token';

const SLUG = '[^/]+';
const ID = '[0-9]+';
// [methods, path below /api]. Exact paths only: anything not here is refused.
const ALLOWED = [
  ['GET', '/auth/session'],
  ['GET', '/embed/me'],
  ['POST', '/embed/logout'],
  ['GET', '/chat/rooms'],
  ['GET POST', `/chat/rooms/${SLUG}/messages`],
  ['POST', `/chat/rooms/${SLUG}/read`],
  ['PUT DELETE', `/chat/rooms/${SLUG}/mute`],
  ['POST', `/chat/messages/${ID}/report`],
  ['GET', '/chat/unread'],
  ['GET', '/chat/members'],
  ['GET', '/chat/media'],
  ['GET', '/chat/favourites'],
  ['PUT DELETE', `/chat/favourites/(rooms/${SLUG}|users/${ID})`],
  ['GET', '/chat/direct'],
  ['GET POST', `/chat/direct/${ID}`],
  ['POST', `/chat/direct/${ID}/(read|report)`],
].map(([methods, path]) => ({ methods: methods.split(' '), path: new RegExp(`^${path}$`) }));

export const embedAllows = (method, path) =>
  ALLOWED.some((rule) => rule.methods.includes(method) && rule.path.test(path));

// After currentUser and before the 2FA gate (which then judges the token's member as usual).
export function embedTokenAuth(db, origins) {
  return (req, res, next) => {
    const token = req.get(EMBED_TOKEN_HEADER);
    if (token === undefined) return next();
    const found = findActiveToken(db, origins, token);
    // The embed forgets its token and key on this answer (client/src/embed/embedAuth.js).
    if (!found) return sendError(res, 401, 'embed_token_invalid', 'Please log in again.');
    if (!embedAllows(req.method, req.path)) {
      return sendError(res, 403, 'embed_not_allowed', 'This is not available in an embedded chat.');
    }
    req.user = found.user;
    req.embed = found;
    next();
  };
}
