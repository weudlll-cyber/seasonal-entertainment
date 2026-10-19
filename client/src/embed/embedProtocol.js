// ============================================================
// File:        embedProtocol.js
// Path:        client/src/embed/embedProtocol.js
// Project:     Seasonal Entertainment
// Description: The postMessage API between the embedded chat (/embed/chat in an iframe) and
//              the page that frames it (docs/EMBED.md). The embed talks only to its parent's
//              origin, and only once that origin is known to be this site itself or a site an
//              admin approved (asked of the server, which keeps the list). Every message goes
//              to exactly that origin (never "*"); messages from any other origin or window
//              are ignored. Nothing secret ever goes to the host: no token, no key, no message
//              text. Embed -> host: ready, unread, resize. Host -> embed: visible, theme.
//              The login popup's message (LOGIN_SOURCE) goes popup -> embed, same origin only.
// ============================================================

import { api } from '../api/http.js';

export const EMBED_SOURCE = 'seasonal-chat'; // on every message the embed sends
export const HOST_SOURCE = 'seasonal-chat-host'; // required on every message the host sends
export const LOGIN_SOURCE = 'seasonal-chat-login'; // the login popup's hand-over

const framed = () => window.parent !== window;

// The framing page's origin as the browser reports it: ancestorOrigins (Chromium, Safari) or
// the referrer (Firefox); null when not framed or not known.
export function parentOrigin() {
  if (!framed()) return null;
  const ancestor = window.location.ancestorOrigins?.[0];
  if (ancestor) return ancestor;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

// The origin to talk to: this site itself, or a site the server confirms; else null.
export async function verifyHost(origin) {
  if (!origin || origin === 'null') return null;
  if (origin === window.location.origin) return origin;
  const { allowed } = await api(`/embed/check?origin=${encodeURIComponent(origin)}`);
  return allowed ? origin : null;
}

// host: the verified origin (null: say nothing at all).
export function toHost(host, type, data = {}) {
  if (host && framed()) window.parent.postMessage({ source: EMBED_SOURCE, type, ...data }, host);
}

export const fromHost = (host, event) =>
  Boolean(host) &&
  framed() &&
  event.origin === host &&
  event.source === window.parent &&
  event.data?.source === HOST_SOURCE;

// Calls onMessage(data) for each host message; returns the function that stops listening.
export function onHostMessage(host, onMessage) {
  const listener = (event) => {
    if (fromHost(host, event)) onMessage(event.data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
