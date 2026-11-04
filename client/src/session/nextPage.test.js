// ============================================================
// File:        nextPage.test.js
// Path:        client/src/session/nextPage.test.js
// Project:     Seasonal Entertainment
// Description: Guards where the login and registration pages send a visitor (nextPage.js): a
//              path on this site, else the account page; "/\evil.example", which browsers read
//              as another host, too (the server's rule, shared/localPath.js).
// ============================================================

import { expect, it } from 'vitest';
import { inEmbedLoginFlow, safeNext } from './nextPage.js';

it('keeps a path on this site', () => {
  expect(safeNext('/chat?room=general')).toBe('/chat?room=general');
});

it.each(['//evil.example', '/\\evil.example', 'https://evil.example/', null])(
  'sends %s to the account page instead',
  (value) => {
    expect(safeNext(value)).toBe('/account');
  }
);

it("knows the embedded chat's login popup only by a safe next", () => {
  expect(inEmbedLoginFlow('?next=%2Fembed-login%3Forigin%3Dx')).toBe(true);
  expect(inEmbedLoginFlow('?next=%2F%5Cembed-login')).toBe(false);
});
