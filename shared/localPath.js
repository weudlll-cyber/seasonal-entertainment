// ============================================================
// File:        localPath.js
// Path:        shared/localPath.js
// Project:     Seasonal Entertainment
// Description: Where a page may send a visitor after a login (?next=): only a path on this site.
//              The server's Discord flow (server/src/discord/routes.js) and the browser's login
//              and registration pages (client/src/session/nextPage.js) use this one rule.
// ============================================================

// A path starting with one "/", no backslash anywhere: "//evil.example", "/\evil.example" (which
// browsers read as "//evil.example") and "https://..." would leave the site.
const LOCAL_PATH = /^\/(?![/\\])[^\\]*$/;

// value when it is such a path, else fallback.
export const localPathOr = (value, fallback) =>
  typeof value === 'string' && LOCAL_PATH.test(value) ? value : fallback;
