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
//              keys, account, 2FA, admin, calls — answers 403. A guest's requests from such a
//              frame name the site instead (X-Embed-Origin, the frame's verified parent) and
//              may carry a guest token (guestTokens.js): they act as a guest, on the guest
//              routes below only, while the site's rules allow it (reading, writing: the
//              "Other sites" settings or the site's own, origins.js). Requests without either
//              header keep cookie sessions exactly as before; CSRF rules are unaffected.
// ============================================================

import { sendError } from '../http/errors.js';
import { EMBED_GUEST_HEADER, guestTokens } from './guestTokens.js';
import { normaliseOrigin } from './origins.js';
import { findActiveToken } from './tokens.js';

const EMBED_TOKEN_HEADER = 'X-Embed-Token';
const EMBED_SITE_HEADER = 'X-Embed-Origin';

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
];
// What a guest of the frame may reach: the session (with the public settings), reading rooms
// and writing and reporting in them, as guests do on the site itself.
const GUEST_ALLOWED = [
  ['GET', '/auth/session'],
  ['GET', '/chat/rooms'],
  ['GET POST', `/chat/rooms/${SLUG}/messages`],
  ['POST', `/chat/messages/${ID}/report`],
];

const rules = (list) =>
  list.map(([methods, path]) => ({ methods: methods.split(' '), path: new RegExp(`^${path}$`) }));
const MEMBER_RULES = rules(ALLOWED);
const GUEST_RULES = rules(GUEST_ALLOWED);
const allows = (list, method, path) =>
  list.some((rule) => rule.methods.includes(method) && rule.path.test(path));

// A guest in a frame on another site: the site approved, the route a guest route, and the
// site's rules allowing it. Sets req.embedSite, req.embedGuest (from a valid token, else null)
// and req.signEmbedGuest (for a new guest name, chat/guestIdentity.js); the request then
// acts as a guest, whatever cookie came along.
function embeddedGuest(req, res, next, { origins, tokens, local }) {
  const { origin } = normaliseOrigin(req.get(EMBED_SITE_HEADER), local);
  if (!origin || !origins.allows(origin)) {
    return sendError(res, 403, 'origin_not_allowed', 'This site may not embed the chat.');
  }
  if (!allows(GUEST_RULES, req.method, req.path)) {
    return sendError(res, 403, 'embed_not_allowed', 'This is not available in an embedded chat.');
  }
  const chat = req.path.startsWith('/chat/');
  if (chat && !origins.rule(origin, 'guestsRead')) {
    return sendError(res, 403, 'embed_guests_off', 'Please log in to read the chat on this site.');
  }
  if (chat && req.method !== 'GET' && !origins.rule(origin, 'guestsWrite')) {
    return sendError(res, 403, 'embed_guests_write_off', 'Please log in to write here.');
  }
  req.user = null;
  req.embedSite = origin;
  req.embedGuest = tokens.verify(req.get(EMBED_GUEST_HEADER), origin);
  req.signEmbedGuest = (guest) => tokens.sign(guest, origin);
  next();
}

// After currentUser and before the 2FA gate (which then judges the token's member as usual).
export function embedTokenAuth(db, origins, config) {
  const guests = {
    origins,
    tokens: guestTokens(config.sessionSecret),
    // Plain http on this machine's own names is fine for trying it out, never in production.
    local: { allowLocalHttp: !config.isProduction },
  };
  return (req, res, next) => {
    const token = req.get(EMBED_TOKEN_HEADER);
    if (token === undefined) {
      return req.get(EMBED_SITE_HEADER) === undefined
        ? next()
        : embeddedGuest(req, res, next, guests);
    }
    const found = findActiveToken(db, origins, token);
    // The embed forgets its token and key on this answer (client/src/embed/embedAuth.js).
    if (!found) return sendError(res, 401, 'embed_token_invalid', 'Please log in again.');
    if (!allows(MEMBER_RULES, req.method, req.path)) {
      return sendError(res, 403, 'embed_not_allowed', 'This is not available in an embedded chat.');
    }
    req.user = found.user;
    req.embed = found;
    next();
  };
}
