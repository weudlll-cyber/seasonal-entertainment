// ============================================================
// File:        types.js
// Path:        server/src/settings/types.js
// Project:     Seasonal Entertainment
// Description: The kinds of site setting (definitions.js): on/off, whole number, short text
//              and a choice from a list. Each kind turns the stored text back into its value
//              and checks a new value against the setting's rules, answering a message fit for
//              the admin page when it does not fit.
// ============================================================

import { isControl } from '../http/validate.js';

export const TYPES = {
  boolean: {
    parse: (text) => text === 'true',
    check: (definition, value) =>
      typeof value === 'boolean' ? null : `${definition.label} must be on or off.`,
  },
  integer: {
    parse: Number,
    check: (definition, value) =>
      Number.isInteger(value) && value >= definition.min && value <= definition.max
        ? null
        : `${definition.label} must be a whole number from ${definition.min} to ${definition.max}.`,
  },
  // definition.maxLength; optional definition.validate(value) for a rule of its own (a path).
  text: {
    parse: String,
    check: (definition, value) => {
      // Line breaks and other control characters never belong in a one-line setting.
      if (typeof value !== 'string' || [...value].some(isControl)) {
        return `${definition.label} must be one line of text.`;
      }
      if (value.length > definition.maxLength) {
        return `${definition.label} may be at most ${definition.maxLength} characters.`;
      }
      return definition.validate?.(value) ?? null;
    },
  },
  // choices: [{ value, label }], already resolved for the database (definitions.js).
  choice: {
    parse: String,
    check: (definition, value, choices) =>
      choices.some((choice) => choice.value === value)
        ? null
        : `${definition.label} must be one of: ${choices.map((c) => c.label).join(', ')}.`,
  },
};
