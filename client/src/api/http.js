// ============================================================
// File:        http.js
// Path:        client/src/api/http.js
// Project:     Seasonal Entertainment
// Description: The one way the client calls the API: JSON in, JSON out, same-origin cookies.
//              Failures throw ApiError carrying the server's stable code and its message.
// ============================================================

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Request failed.');
  }
  return data;
}
