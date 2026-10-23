// ============================================================
// File:        http.js
// Path:        client/src/api/http.js
// Project:     Seasonal Entertainment
// Description: The one way the client calls the API: JSON in, JSON out, same-origin cookies
//              (upload(): a file as the raw body). Failures throw ApiError carrying the
//              server's stable code, its message and the rest of its answer (details). The chat
//              embedded on an approved foreign site also sends its embed token
//              (embed/embedAuth.js), and drops it when the server refuses it; for a guest there
//              it names the site and sends the guest's token, and keeps a new one it is given.
// ============================================================

import {
  dropEmbedToken,
  embedHeaders,
  embedToken,
  keepEmbedGuestToken,
} from '../embed/embedAuth.js';

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function call(path, init) {
  const headers = { ...init.headers, ...embedHeaders() };
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers });
  // A guest's first message from a frame on another site names them: kept for the next ones.
  const guestToken = res.headers?.get('X-Embed-Guest');
  if (guestToken) keepEmbedGuestToken(guestToken);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === 'embed_token_invalid') dropEmbedToken();
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Request failed.', data);
  }
  return data;
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
