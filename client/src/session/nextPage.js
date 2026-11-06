// ============================================================
// File:        nextPage.js
// Path:        client/src/session/nextPage.js
// Project:     Seasonal Entertainment
// Description: Where the login and registration pages send a visitor afterwards: back to the
//              page that sent them (?next=), e.g. the embedded chat's login popup
//              (/embed-login?origin=…), when that is a path on this site — else the account
//              page. Links between the two pages keep ?next=, so switching from logging in to
//              registering loses nothing. goToNext goes there: a path under /games/<slug>/ (an
//              embedded game's own pages, docs/AUTH.md, "Embedded games") with a full page load,
//              everything else inside the app. inEmbedLoginFlow tells the shell that such a page
//              runs inside the chat's login popup.
// ============================================================

import { localPathOr } from '@seasonal-entertainment/shared/localPath.js';

// Only local paths (shared/localPath.js, the server's rule too): "//evil.example",
// "/\evil.example" or "https://..." would be an open redirect.
export const safeNext = (value) => localPathOr(value, '/account');

// "/games/" and at least one character more: an embedded game, served beside this app by the
// host's nginx. "/games" alone is the app's own games page.
const GAME_PAGE = /^\/games\/./;

// After a login, registration or Discord sign-up: to the safe `next` (raw ?next= value). A game's
// page needs a real request (the app has no route for it, and the game's sign-in route must be
// asked); safeNext keeps it a path on this site, so the page load never leaves the origin.
// navigate: the router's, used for every other path as before (replacing the login page).
export function goToNext(navigate, next) {
  const path = safeNext(next);
  if (GAME_PAGE.test(path)) window.location.assign(path);
  else navigate(path, { replace: true });
}

// A link to `page` (/login, /register) carrying `next` along when there is one.
export const withNext = (page, next) => (next ? `${page}?next=${encodeURIComponent(next)}` : page);

// The page runs inside the embedded chat's login popup (?next= leads back to /embed-login).
export const inEmbedLoginFlow = (search) =>
  safeNext(new URLSearchParams(search).get('next')).startsWith('/embed-login');
