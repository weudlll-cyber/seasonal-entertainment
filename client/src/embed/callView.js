// ============================================================
// File:        callView.js
// Path:        client/src/embed/callView.js
// Project:     Seasonal Entertainment
// Description: The rules of the call view inside a game (/embed/call/<id>, EmbedCallPage.jsx;
//              docs/GAME-INTEGRATION.md section 9, decided 2026-11-20): who may frame it (a
//              game of this site under /games/<slug>/, nothing else), which form it shows for
//              the frame it gets (the 16:9 picture; the 48 px column below 267 x 150 or when
//              collapsed; in a frame wider than tall and under 96 px high the phone's strip, or
//              on a desktop the low row of a 100 px docked strip, decided 2026-11-28), the size
//              it asks for when it switches form, and the names of its postMessage sources.
//              Pure, so the tests read them directly.
// ============================================================

export const CALL_SOURCE = 'seasonal-call'; // on every message the view sends
export const CALL_HOST_SOURCE = 'seasonal-call-host'; // required on every message the game sends

// The smallest picture (16:9).
export const SMALLEST = { width: 267, height: 150 };
// The collapsed form's width on a desktop, and the phone strip's height.
export const BAR = 48;
// Below the site's own breakpoint (min-width: 760px) the game is laid out for a phone.
export const PHONE_MAX_WIDTH = 759;

// The game whose page frames the view: its slug when the parent is this site's own page under
// /games/<slug>/ (a parent on another origin cannot even be read), else null.
export function framingGame(win = window) {
  if (win.parent === win) return null;
  try {
    const { origin, pathname } = win.parent.location;
    if (origin !== win.location.origin) return null;
    return /^\/games\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

// Whether the game around the view is laid out for a phone (its window, not the frame's).
export function onPhone(win = window) {
  try {
    return win.parent.innerWidth <= PHONE_MAX_WIDTH;
  } catch {
    return win.innerWidth <= PHONE_MAX_WIDTH;
  }
}

// The form for a frame of width x height: wider than tall and under two bars high, 'strip'
// (a phone's audio strip) or 'low' (a desktop's low docked strip, where no other form can be
// asked for); 'column' (collapsed, or smaller than the smallest picture) or 'picture'.
export function formOf({ width, height, collapsed, phone = false }) {
  if (width > height && height < 2 * BAR) return phone ? 'strip' : 'low';
  if (collapsed || width < SMALLEST.width || height < SMALLEST.height) return 'column';
  return 'picture';
}

// The resize message's fields for switching to `mode` ('picture' | 'collapsed') from a frame of
// width x height: on a desktop the strip's height stays (16:9 wide, or 48 px wide); on a phone
// the full width stays (width x 9/16 high, or the 48 px strip).
export function resizeFor(mode, { width, height, phone }) {
  if (mode === 'picture') {
    return phone
      ? { mode, width, height: Math.round((width * 9) / 16) }
      : { mode, width: Math.round((height * 16) / 9), height };
  }
  return phone ? { mode, width, height: BAR } : { mode, width: BAR, height };
}
