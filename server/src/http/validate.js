// ============================================================
// File:        validate.js
// Path:        server/src/http/validate.js
// Project:     Seasonal Entertainment
// Description: Request-body validation: runs one validator per field (validators return an
//              error sentence or null) and answers 400 with the first error.
// ============================================================

import { sendError } from './errors.js';

// Returns the cleaned field values, or null after sending the 400 itself.
export function validBody(req, res, validators) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const values = {};
  for (const [field, validator] of Object.entries(validators)) {
    const error = validator(body[field]);
    if (error) {
      sendError(res, 400, 'invalid_input', error);
      return null;
    }
    values[field] = body[field];
  }
  return values;
}

// Common field validators.
export const required = (label, max) => (value) =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? null
    : `${label} is required (at most ${max} characters).`;

export const mustBeTrue = (message) => (value) => (value === true ? null : message);
