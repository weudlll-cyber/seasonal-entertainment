// ============================================================
// File:        localPath.test.js
// Path:        shared/localPath.test.js
// Project:     Seasonal Entertainment
// Description: Guards the ?next= rule (localPath.js): paths on this site pass, anything that
//              would leave it (another host, a scheme, a backslash) falls back.
// ============================================================

import { expect, it } from 'vitest';
import { localPathOr } from './localPath.js';

it.each(['/account', '/chat?room=general', '/embed-login?origin=https%3A%2F%2Fgame.example'])(
  'keeps %s',
  (path) => {
    expect(localPathOr(path, '/fallback')).toBe(path);
  }
);

it.each([
  '//evil.example',
  '/\\evil.example',
  '/a\\b',
  'https://evil.example/',
  'account',
  '',
  null,
  undefined,
])('refuses %s', (value) => {
  expect(localPathOr(value, '/fallback')).toBe('/fallback');
});
