// ============================================================
// File:        embedAuth.js
// Path:        client/src/embed/embedAuth.js
// Project:     Seasonal Entertainment
// Description: The embed token of the chat embedded on an approved foreign site
//              (docs/EMBED.md): held in this module's memory only — never in storage, which
//              is partitioned on a foreign site and must not outlive the page. api/http.js
//              sends it, chat/connection.js offers it on the socket, keys/KeyContext.jsx keeps
//              the private key in memory only while the page is a foreign embed. When the
//              server refuses the token (expired, logged out, password changed, site removed)
//              it is dropped, and whoever listens forgets the member and the key at once.
//              Also the frame's site, once verified, with what guests may do there
//              (/api/embed/check), and a guest's token there (embed/guestTokens.js on the
//              server): kept in the frame's own storage, which the browser keeps per site, so
//              the guest name lasts there without a cookie. embedHeaders() is what api/http.js
//              sends.
// ============================================================

import { readStored, writeStored } from '../app/storage.js';

let token = null;
let foreign = false;
const listeners = new Set();

// The page is the chat on another site's page (decided once, before anything loads).
export function markForeignEmbed() {
  foreign = true;
}
export const isForeignEmbed = () => foreign;

export const embedToken = () => token;
export function setEmbedToken(next) {
  token = next;
}

export function dropEmbedToken() {
  if (token === null) return;
  token = null;
  for (const listener of listeners) listener();
}

let site = null; // the verified other site this frame is on
let rules = null; // what guests may do there: { guestsRead, guestsWrite }
const GUEST_TOKEN = 'se.embedGuest';

export function setEmbedSite(origin, siteRules) {
  site = origin;
  rules = siteRules;
}
// Unknown until the site is verified: reading as on the site, writing not.
export const guestsMayRead = () => rules?.guestsRead !== false;
export const guestsMayWrite = () => rules?.guestsWrite === true;
export const keepEmbedGuestToken = (guestToken) => writeStored(GUEST_TOKEN, guestToken);

// A member's token; else, on a verified other site, the site and the guest's token if any.
export function embedHeaders() {
  if (token) return { 'X-Embed-Token': token };
  if (!site) return {};
  const guest = readStored(GUEST_TOKEN);
  return { 'X-Embed-Origin': site, ...(guest && { 'X-Embed-Guest': guest }) };
}

// Returns the function that stops listening.
export function onEmbedTokenDropped(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
