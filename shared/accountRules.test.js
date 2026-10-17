// ============================================================
// File:        accountRules.test.js
// Path:        shared/accountRules.test.js
// Project:     Seasonal Entertainment
// Description: Guards the shared account rules: username format, password length, email
//              shape and the role order.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN,
  roleAtLeast,
  validateEmail,
  validatePassword,
  validateUsername,
} from './accountRules.js';

describe('validateUsername', () => {
  it.each(['anna', 'Anna_99', 'a.b-c', 'x1y'])('accepts %s', (name) => {
    expect(validateUsername(name)).toBeNull();
  });
  it.each(['ab', 'a'.repeat(25), '_anna', 'an na', 'anna!', '<b>', '', undefined, 'Guest-7k2f'])(
    'refuses %s',
    (name) => {
      expect(validateUsername(name)).toMatch(/Username/);
    }
  );
});

describe('validatePassword', () => {
  it('needs the minimum length', () => {
    expect(validatePassword('x'.repeat(PASSWORD_MIN - 1))).toMatch(/at least/);
    expect(validatePassword('x'.repeat(PASSWORD_MIN))).toBeNull();
  });
  it('refuses more than 72 bytes, which bcrypt would silently cut', () => {
    expect(validatePassword('ä'.repeat(37))).toMatch(/at most/);
  });
});

describe('validateEmail', () => {
  it('accepts a normal address and refuses obvious junk', () => {
    expect(validateEmail('anna@example.org')).toBeNull();
    expect(validateEmail('anna@example')).toMatch(/email/);
    expect(validateEmail('an na@example.org')).toMatch(/email/);
  });
});

describe('roleAtLeast', () => {
  it('orders member < organiser < admin', () => {
    expect(roleAtLeast('admin', 'organiser')).toBe(true);
    expect(roleAtLeast('organiser', 'organiser')).toBe(true);
    expect(roleAtLeast('member', 'organiser')).toBe(false);
    expect(roleAtLeast('nobody', 'member')).toBe(false);
  });
});
