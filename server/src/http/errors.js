// ============================================================
// File:        errors.js
// Path:        server/src/http/errors.js
// Project:     Seasonal Entertainment
// Description: The one error response shape of the API: { ok: false, error, message }.
//              `error` is a stable code for programs, `message` a sentence for people.
// ============================================================

export function sendError(res, status, error, message) {
  return res.status(status).json({ ok: false, error, message });
}

// Last handler of the app: anything thrown and not answered becomes a plain 500 without
// details (they go to the server log only).
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'too_large', 'The request body is too large.');
  }
  console.error('[server] unhandled error:', err);
  return sendError(res, 500, 'server_error', 'Something went wrong on the server.');
}
