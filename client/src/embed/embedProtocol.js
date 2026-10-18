// ============================================================
// File:        embedProtocol.js
// Path:        client/src/embed/embedProtocol.js
// Project:     Seasonal Entertainment
// Description: The postMessage API between the embedded chat (/embed/chat in an iframe) and
//              the page that frames it (docs/EMBED.md). Same site only: the embed posts to its
//              parent with this very origin as the target (a page on another origin receives
//              nothing) and listens only to its own parent on this origin.
//              Embed -> host: ready, unread, resize. Host -> embed: visible, theme.
// ============================================================

export const EMBED_SOURCE = 'seasonal-chat'; // on every message the embed sends
export const HOST_SOURCE = 'seasonal-chat-host'; // required on every message the host sends

const framed = () => window.parent !== window;

// Sends { source, type, ...data } to the framing page, if there is one on this origin.
export function toHost(type, data = {}) {
  if (framed())
    window.parent.postMessage({ source: EMBED_SOURCE, type, ...data }, window.location.origin);
}

// A message the embed may act on: from its own parent, on this origin, marked as the host's.
export const fromHost = (event) =>
  framed() &&
  event.origin === window.location.origin &&
  event.source === window.parent &&
  event.data?.source === HOST_SOURCE;

// Calls onMessage(data) for each host message; returns the function that stops listening.
export function onHostMessage(onMessage) {
  const listener = (event) => {
    if (fromHost(event)) onMessage(event.data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
