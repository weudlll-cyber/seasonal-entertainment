// ============================================================
// File:        settingTypes.test.js
// Path:        server/test/settingTypes.test.js
// Project:     Seasonal Entertainment
// Description: The kinds of site setting (settings/types.js): on/off only as true or false; a
//              whole number only within its bounds; a short text only as one line within its
//              length and its own rule; a choice only from its list. Stored text turns back
//              into the kind's value.
// ============================================================

import { describe, expect, it } from 'vitest';
import { TYPES } from '../src/settings/types.js';

const check = (type, definition, value, choices) =>
  TYPES[type].check({ label: 'It', ...definition }, value, choices);

describe('on/off', () => {
  it('takes true and false only', () => {
    expect(check('boolean', {}, true)).toBeNull();
    expect(check('boolean', {}, false)).toBeNull();
    for (const value of ['true', 1, null]) {
      expect(check('boolean', {}, value)).toBe('It must be on or off.');
    }
    expect([TYPES.boolean.parse('true'), TYPES.boolean.parse('false')]).toEqual([true, false]);
  });
});

describe('whole number', () => {
  const bounds = { min: 2, max: 9 };
  it('takes whole numbers from min to max, both included', () => {
    expect(check('integer', bounds, 2)).toBeNull();
    expect(check('integer', bounds, 9)).toBeNull();
    for (const value of [1, 10, 2.5, '5', null]) {
      expect(check('integer', bounds, value)).toBe('It must be a whole number from 2 to 9.');
    }
    expect(TYPES.integer.parse('7')).toBe(7);
  });
});

describe('short text', () => {
  const rules = { maxLength: 5 };
  it('takes one line up to its length, empty included', () => {
    expect(check('text', rules, '')).toBeNull();
    expect(check('text', rules, 'abcde')).toBeNull();
    expect(check('text', rules, 'abcdef')).toBe('It may be at most 5 characters.');
    for (const value of ['a\nb', 'a\tb', 5]) {
      expect(check('text', rules, value)).toBe('It must be one line of text.');
    }
  });

  it("applies the setting's own rule last", () => {
    const own = { maxLength: 20, validate: (v) => (v.startsWith('/') ? null : 'A path, please.') };
    expect(check('text', own, '/start')).toBeNull();
    expect(check('text', own, 'start')).toBe('A path, please.');
  });
});

describe('choice', () => {
  const choices = [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
  ];
  it('takes a value from its list only', () => {
    expect(check('choice', {}, 'warning', choices)).toBeNull();
    expect(check('choice', {}, 'Warning', choices)).toBe('It must be one of: Info, Warning.');
    expect(check('choice', {}, null, choices)).toBe('It must be one of: Info, Warning.');
  });
});
