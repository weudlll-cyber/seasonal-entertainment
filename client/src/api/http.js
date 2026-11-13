// ============================================================
// File:        http.js
// Path:        client/src/api/http.js
// Project:     Seasonal Entertainment
// Description: The one way the client calls the API: JSON in, JSON out, same-origin cookies
//              (upload(): a file as the raw body). Failures throw ApiError carrying the
//              server's stable code, its message and the rest of its answer (details); with no
//              answer from the site itself (no connection, or a proxy's 502/503/504 or any page
//              that is not JSON) the message is NO_ANSWER, code 'no_answer', status 0 when
//              nothing came back at all. The chat
//              embedded on an approved foreign site also sends its embed token
//              (embed/embedAuth.js), and drops it when the server refuses it; for a guest there
//              it names the site and sends the guest's token, and keeps a new one it is given.
//              Any answer "not_authenticated" (the server no longer knows this browser's
//              sign-in), and the return check's "nobody" (session/returnCheck.js), goes through
//              reportSessionEnded to onSessionEnded's listeners (session/SessionContext.jsx),
//              except in that foreign embed, whose token has its own rule.
// ============================================================

import {
  dropEmbedToken,
  embedHeaders,
  embedToken,
  isForeignEmbed,
  keepEmbedGuestToken,
} from '../embed/embedAuth.js';

export class ApiError extends Error {
  // cause: what failed underneath (fetch's own error), for the console and the tests.
  constructor(status, code, message, details = {}, cause = undefined) {
    super(message, { cause });
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const NO_ANSWER = 'The server did not answer. Please try again in a moment.';
// What a proxy in front of the site answers when the site is down or slow (seen 2026-11-03 as a
// 502 from the dev proxy).
const PROXY_FAILURES = new Set([502, 503, 504]);

const sessionEndedListeners = new Set();

// Returns the function that stops listening.
export function onSessionEnded(listener) {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

// The one way to say the server no longer knows this browser's sign-in.
export function reportSessionEnded() {
  if (isForeignEmbed()) return;
  for (const listener of sessionEndedListeners) listener();
}

async function call(path, init) {
  const headers = { ...init.headers, ...embedHeaders() };
  let res;
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers });
  } catch (err) {
    throw new ApiError(0, 'no_answer', NO_ANSWER, {}, err);
  }
  // A guest's first message from a frame on another site names them: kept for the next ones.
  const guestToken = res.headers?.get('X-Embed-Guest');
  if (guestToken) keepEmbedGuestToken(guestToken);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error === 'embed_token_invalid') dropEmbedToken();
    // One place for every page: whoever believes a member is signed in learns it has ended.
    if (data?.error === 'not_authenticated') reportSessionEnded();
    // The server's own message always wins; without one, a reply the site did not write.
    if (data?.message) throw new ApiError(res.status, data.error ?? 'error', data.message, data);
    if (!data || PROXY_FAILURES.has(res.status))
      throw new ApiError(res.status, 'no_answer', NO_ANSWER, data ?? {});
    throw new ApiError(res.status, data.error ?? 'error', 'Request failed.', data);
  }
  return data ?? {};
}

// The chat socket's subprotocols (chat/connection.js): the embed token offered as
// "se-embed.<token>" where the page is the chat on an approved foreign site, else none.
export function socketProtocols() {
  const token = embedToken();
  return token ? ['se-chat', `se-embed.${token}`] : [];
}

export function api(path, { method = 'GET', body } = {}) {
  return call(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Sends a file as the raw request body (admin media upload); text fields go in the query.
export function upload(path, file, fields) {
  return call(`${path}?${new URLSearchParams(fields)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
}
