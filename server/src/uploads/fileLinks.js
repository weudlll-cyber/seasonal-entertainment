// ============================================================
// File:        fileLinks.js
// Path:        server/src/uploads/fileLinks.js
// Project:     Seasonal Entertainment
// Description: Short-lived links to an uploaded file for the chat embedded on another site
//              (docs/EMBED.md, "Files on other sites"): an image or download there is a plain
//              request that cannot carry the member's embed token, so the frame asks for a
//              link, ?link=<token id>.<expiry>.<signature>, good for LINK_MS, for one file
//              and one variant, and only while that embed token is active. The signature uses
//              a key derived from the session secret. A link makes no file public: the file
//              route still asks whether the token's member may read it (routes.js).
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export const LINK_MS = 5 * 60_000;

export function fileLinks(secret) {
  const key = createHmac('sha256', secret).update('chat-file-link').digest();
  const mac = (fileId, variant, tokenId, expires) =>
    createHmac('sha256', key).update(`${fileId}.${variant}.${tokenId}.${expires}`).digest();
  return {
    // The link's query value for the file's variant, for the member's embed token.
    sign(fileId, variant, tokenId, now = Date.now()) {
      const expires = now + LINK_MS;
      return `${tokenId}.${expires}.${mac(fileId, variant, tokenId, expires).toString('base64url')}`;
    },
    // The embed token's id when the link is intact, for this file and variant, and not
    // expired; else null.
    verify(link, fileId, variant, now = Date.now()) {
      const parts = typeof link === 'string' ? link.split('.') : [];
      if (parts.length !== 3) return null;
      const [tokenId, expires] = parts.slice(0, 2).map(Number);
      if (!Number.isInteger(tokenId) || !(expires > now)) return null;
      const given = Buffer.from(parts[2], 'base64url');
      const expected = mac(fileId, variant, tokenId, expires);
      return given.length === expected.length && timingSafeEqual(given, expected) ? tokenId : null;
    },
  };
}
