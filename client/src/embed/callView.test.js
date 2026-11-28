// ============================================================
// File:        callView.test.js
// Path:        client/src/embed/callView.test.js
// Project:     Seasonal Entertainment
// Description: The call view's rules (callView.js; docs/GAME-INTEGRATION.md section 9): only a
//              page of this site under /games/<slug>/ may use it (not another page, not another
//              origin, not when unframed); the form for each frame size of the contract
//              (338 x 190 and 267 x 150 pictures, the 48 px column below that or collapsed,
//              the 48 px phone strip); the size it asks for when it switches form.
// ============================================================

import { describe, expect, it } from 'vitest';
import { formOf, framingGame, onPhone, resizeFor } from './callView.js';

const SITE = 'https://site.test';
// A frame whose parent shows `pathname` on `origin`.
const framedBy = (pathname, origin = SITE, innerWidth = 1280) => {
  const win = { location: { origin: SITE } };
  win.parent = { location: { origin, pathname }, innerWidth };
  return win;
};

describe('who may frame it', () => {
  it('a game of this site, under /games/<slug>/', () => {
    expect(framingGame(framedBy('/games/bingo/'))).toBe('bingo');
    expect(framingGame(framedBy('/games/mini-games/match/7'))).toBe('mini-games');
  });

  it('not another page, another origin, a look-alike path, or no frame at all', () => {
    expect(framingGame(framedBy('/events'))).toBeNull();
    expect(framingGame(framedBy('/games'))).toBeNull();
    expect(framingGame(framedBy('/games/bingo'))).toBeNull();
    expect(framingGame(framedBy('/games/Bingo/'))).toBeNull();
    expect(framingGame(framedBy('/games/bingo/', 'https://other.test'))).toBeNull();
    const alone = { location: { origin: SITE } };
    alone.parent = alone;
    expect(framingGame(alone)).toBeNull();
    // A parent on another origin cannot even be read.
    const foreign = { location: { origin: SITE } };
    foreign.parent = {
      get location() {
        throw new Error('SecurityError');
      },
    };
    expect(framingGame(foreign)).toBeNull();
  });

  it('a phone by the game window, below the site breakpoint of 760 px', () => {
    expect(onPhone(framedBy('/games/bingo/', SITE, 390))).toBe(true);
    expect(onPhone(framedBy('/games/bingo/', SITE, 760))).toBe(false);
  });
});

describe('the form for its frame', () => {
  it('the picture at 338 x 190 and down to 267 x 150', () => {
    expect(formOf({ width: 338, height: 190 })).toBe('picture');
    expect(formOf({ width: 267, height: 150 })).toBe('picture');
    expect(formOf({ width: 390, height: 219 })).toBe('picture');
  });

  it('the 48 px column when smaller or collapsed', () => {
    expect(formOf({ width: 266, height: 150 })).toBe('column');
    expect(formOf({ width: 267, height: 149 })).toBe('column');
    expect(formOf({ width: 48, height: 190 })).toBe('column');
    expect(formOf({ width: 338, height: 190, collapsed: true })).toBe('column');
  });

  it("the phone's 48 px strip", () => {
    expect(formOf({ width: 390, height: 48, phone: true })).toBe('strip');
    expect(formOf({ width: 390, height: 48, collapsed: true, phone: true })).toBe('strip');
  });

  it("a desktop's low row, wider than tall and under 96 px high", () => {
    expect(formOf({ width: 267, height: 94 })).toBe('low');
    expect(formOf({ width: 267, height: 95, collapsed: true })).toBe('low');
    expect(formOf({ width: 267, height: 96 })).toBe('column');
    // Narrower than tall: the column, as before.
    expect(formOf({ width: 48, height: 94 })).toBe('column');
  });
});

describe('the size it asks for', () => {
  it('on a desktop the strip height stays', () => {
    expect(resizeFor('collapsed', { width: 338, height: 190, phone: false })).toEqual({
      mode: 'collapsed',
      width: 48,
      height: 190,
    });
    expect(resizeFor('picture', { width: 48, height: 150, phone: false })).toEqual({
      mode: 'picture',
      width: 267,
      height: 150,
    });
  });

  it('on a phone the full width stays', () => {
    expect(resizeFor('picture', { width: 390, height: 48, phone: true })).toEqual({
      mode: 'picture',
      width: 390,
      height: 219,
    });
    expect(resizeFor('collapsed', { width: 390, height: 219, phone: true })).toEqual({
      mode: 'collapsed',
      width: 390,
      height: 48,
    });
  });
});
