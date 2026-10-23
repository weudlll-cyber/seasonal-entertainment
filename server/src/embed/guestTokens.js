// ============================================================
// File:        guestTokens.js
// Path:        server/src/embed/guestTokens.js
// Project:     Seasonal Entertainment
// Description: A guest's identity in the chat embedded on another site (docs/EMBED.md, "Guests
//              on other sites"): there the browser keeps no cookie of this site, so the guest
//              name travels as a signed token instead, kept in the frame's own storage and sent
//              in the X-Embed-Guest header. The token names the guest (id and name, as the
//              chat holds them) and the site it was given for, signed with a key derived from
//              the session secret; it is good on that site only. It carries no rights: the
//              site's rules and the chat's guest rules decide every request.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export const EMBED_GUEST_HEADER = 'X-Embed-Guest';

const encode = (text) => Buffer.from(text).toString('base64url');
const decode = (part) => Buffer.from(part, 'base64url').toString();

// secret: the session secret (config.sessionSecret); its own key, so a guest token can never
// pass for anything signed with the session secret itself.
export function guestTokens(secret) {
  const key = createHmac('sha256', secret).update('embed-guest-token').digest();
  const mac = (body) => createHmac('sha256', key).update(body).digest();
  return {
    // "<id>.<name>.<origin>.<signature>", each part base64url.
    sign({ id, name }, origin) {
      const body = [encode(id), encode(name), encode(origin)].join('.');
      return `${body}.${mac(body).toString('base64url')}`;
    },
    // { id, name } when the token is intact and was given for this site, else null.
    verify(token, origin) {
      const parts = typeof token === 'string' ? token.split('.') : [];
      if (parts.length !== 4) return null;
      const body = parts.slice(0, 3).join('.');
      const given = Buffer.from(parts[3], 'base64url');
      const expected = mac(body);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      const [id, name, site] = parts.slice(0, 3).map(decode);
      return site === origin ? { id, name } : null;
    },
  };
}
