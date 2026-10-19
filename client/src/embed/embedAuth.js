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
// ============================================================

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

// Returns the function that stops listening.
export function onEmbedTokenDropped(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
