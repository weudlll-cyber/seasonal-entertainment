// ============================================================
// File:        http.js
// Path:        client/src/api/http.js
// Project:     Seasonal Entertainment
// Description: The one way the client calls the API: JSON in, JSON out, same-origin cookies
//              (upload(): a file as the raw body). Failures throw ApiError carrying the
//              server's stable code and its message.
// ============================================================

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(path, init) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Request failed.');
  }
  return data;
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
