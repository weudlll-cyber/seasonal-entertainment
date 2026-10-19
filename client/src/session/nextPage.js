// ============================================================
// File:        nextPage.js
// Path:        client/src/session/nextPage.js
// Project:     Seasonal Entertainment
// Description: Where the login and registration pages send a visitor afterwards: back to the
//              page that sent them (?next=), e.g. the embedded chat's login popup
//              (/embed-login?origin=…), when that is a path on this site — else the account
//              page. Links between the two pages keep ?next=, so switching from logging in to
//              registering loses nothing.
// ============================================================

// Only local paths: "//evil.example" or "https://..." would be an open redirect.
export function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}

// A link to `page` (/login, /register) carrying `next` along when there is one.
export const withNext = (page, next) => (next ? `${page}?next=${encodeURIComponent(next)}` : page);
