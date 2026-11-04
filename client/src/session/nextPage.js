// ============================================================
// File:        nextPage.js
// Path:        client/src/session/nextPage.js
// Project:     Seasonal Entertainment
// Description: Where the login and registration pages send a visitor afterwards: back to the
//              page that sent them (?next=), e.g. the embedded chat's login popup
//              (/embed-login?origin=…), when that is a path on this site — else the account
//              page. Links between the two pages keep ?next=, so switching from logging in to
//              registering loses nothing. inEmbedLoginFlow tells the shell that such a page
//              runs inside the chat's login popup.
// ============================================================

import { localPathOr } from '@seasonal-entertainment/shared/localPath.js';

// Only local paths (shared/localPath.js, the server's rule too): "//evil.example",
// "/\evil.example" or "https://..." would be an open redirect.
export const safeNext = (value) => localPathOr(value, '/account');

// A link to `page` (/login, /register) carrying `next` along when there is one.
export const withNext = (page, next) => (next ? `${page}?next=${encodeURIComponent(next)}` : page);

// The page runs inside the embedded chat's login popup (?next= leads back to /embed-login).
export const inEmbedLoginFlow = (search) =>
  safeNext(new URLSearchParams(search).get('next')).startsWith('/embed-login');
