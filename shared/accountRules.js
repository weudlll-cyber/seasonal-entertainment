// ============================================================
// File:        accountRules.js
// Path:        shared/accountRules.js
// Project:     Seasonal Entertainment
// Description: Account rules shared by server and client, so a form can never accept what
//              the server refuses (or the other way round): username format, password
//              length, the minimum age, and the role names and their order.
// ============================================================

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
// Letters, digits, underscore, hyphen and dot; must start with a letter or digit. Uniqueness
// is case-insensitive (enforced by the database), so "Anna" and "anna" are the same name.
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
export const USERNAME_HINT = `${USERNAME_MIN}-${USERNAME_MAX} characters: letters, digits, "_", "-" or "."; starting with a letter or digit.`;

// Same minimum as the race game (decided there 2026-10-12); bcrypt reads at most 72 bytes.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export const EMAIL_MAX = 254;

// Registration requires confirming this age; no date of birth is stored (decided 2026-10-17).
export const MINIMUM_AGE = 14;

// Ordered from least to most privileged. Guests are not accounts: no role is stored for them.
export const ROLES = ['member', 'organiser', 'admin'];

export function validateUsername(name) {
  if (typeof name !== 'string') return 'Username is required.';
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX || !USERNAME_PATTERN.test(name)) {
    return `Username must be ${USERNAME_HINT}`;
  }
  // "Guest-..." names belong to chat guests; an account must never look like one.
  if (name.toLowerCase().startsWith('guest-')) return 'Usernames may not start with "Guest-".';
  return null;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters long.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `Password must be at most ${PASSWORD_MAX} bytes long.`;
  }
  return null;
}

// Deliberately simple: one "@", something on both sides, a dot in the domain. Real proof of
// an address would need a confirmation mail, which this site does not send.
export function validateEmail(email) {
  if (
    typeof email !== 'string' ||
    email.length > EMAIL_MAX ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return 'A valid email address is required.';
  }
  return null;
}

// True when `role` is at least `required` in the order above.
export function roleAtLeast(role, required) {
  return ROLES.indexOf(role) >= ROLES.indexOf(required) && ROLES.includes(role);
}
