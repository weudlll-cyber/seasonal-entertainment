// ============================================================
// File:        nextPage.test.js
// Path:        client/src/session/nextPage.test.js
// Project:     Seasonal Entertainment
// Description: Guards where the login and registration pages send a visitor (nextPage.js): a
//              path on this site, else the account page; "/\evil.example", which browsers read
//              as another host, too (the server's rule, shared/localPath.js). goToNext: an
//              embedded game's page (/games/<slug>/...) with a full page load, "/games" itself and
//              every other path inside the app, a foreign or protocol-relative next to the account
//              page inside the app as before.
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { goToNext, inEmbedLoginFlow, safeNext } from './nextPage.js';

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

describe('goToNext', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Where goToNext sends `next`: ['load', path] for a full page load in place of the current page,
  // ['app', path, options] inside the app.
  function wentTo(next) {
    const went = [];
    // A page load that keeps the login page in the history (assign) would be wrong.
    const load = (how) => (path) => went.push([how, path]);
    vi.stubGlobal('location', {
      ...window.location,
      assign: load('assign'),
      replace: load('load'),
    });
    goToNext((path, options) => went.push(['app', path, options]), next);
    return went;
  }

  it.each([
    '/games/mini-games/',
    '/games/bingo/',
    '/games/bingo/auth/website?next=%2Fgames%2Fbingo%2F',
  ])('loads the game page %s fully', (next) => {
    expect(wentTo(next)).toEqual([['load', next]]);
  });

  it.each(['/games', '/games?tab=all', '/chat', '/embed-login?origin=x'])(
    'keeps %s inside the app, replacing the login page',
    (next) => {
      expect(wentTo(next)).toEqual([['app', next, { replace: true }]]);
    }
  );

  it.each([
    '//evil.example/games/x',
    '/\\evil.example/games/x',
    'https://evil.example/games/bingo/',
    null,
  ])('sends %s to the account page inside the app, as before', (next) => {
    expect(wentTo(next)).toEqual([['app', '/account', { replace: true }]]);
  });
});
