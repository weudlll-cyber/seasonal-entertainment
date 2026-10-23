// ============================================================
// File:        validate.js
// Path:        server/src/http/validate.js
// Project:     Seasonal Entertainment
// Description: Request-body validation: runs one validator per field (validators return an
//              error sentence or null) and answers 400 with the first error; queryId, the one
//              reading of a paging id from the query string (?before=, ?after=); and isControl,
//              the one test for a control character.
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

// A paging id from the query string: a whole number, or undefined when absent or not one
// (a bad value means "no paging", never an error).
// C0 and C1 control characters (tabs and newlines included): link previews turn them into
// spaces (previews/parseMeta.js), a one-line site setting refuses them (settings/types.js).
export const isControl = (char) => {
  const code = char.codePointAt(0);
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
};

export const queryId = (value) => (/^\d+$/.test(value ?? '') ? Number(value) : undefined);

// A record id or similar: a whole number above zero.
export const positiveInteger = (label) => (value) =>
  Number.isInteger(value) && value > 0 ? null : `${label} is required.`;
