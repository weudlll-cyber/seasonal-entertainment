// ============================================================
// File:        securityHeaders.js
// Path:        server/src/http/securityHeaders.js
// Project:     Seasonal Entertainment
// Description: Security response headers (helmet) with a strict Content-Security-Policy.
//              Everything the page loads comes from this origin; nothing inline may run, and no
//              JavaScript eval. WebAssembly may be compiled ('wasm-unsafe-eval'): the browser's
//              cryptography (libsodium, docs/AUTH.md) is WebAssembly, loaded from this origin.
//              The one other origin is the call service's (CALLS_URL, docs/CALLS.md), for
//              connections only. Permissions-Policy lets only this origin ask for the camera,
//              the microphone and screen capture (calls). No page may be framed
//              (frame-ancestors 'none'), except the embedded chat under /embed/: this site's
//              own pages and exactly the sites an admin approved may frame it
//              (frame-ancestors 'self' + that list, read per request; docs/EMBED.md). The
//              embed's login popup (/embed-login) keeps every rule but one: no
//              Cross-Origin-Opener-Policy, or the browser would cut it off from the embed that
//              opened it on another site's page (its opener), and the hand-over could not arrive.
// ============================================================

import helmet from 'helmet';

// The built client uses only same-origin files: scripts and styles from /assets, images
// from /assets or data: URLs (the 2FA QR code), and API/WebSocket calls to this origin.
const CSP_BASE = {
  defaultSrc: ["'self'"],
  // 'wasm-unsafe-eval' allows compiling WebAssembly only; JavaScript eval stays forbidden.
  scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), display-capture=(self)';

// The embedded chat's pages (client/src/embed/), and its login popup (not frameable at all).
export const EMBED_PREFIX = '/embed/';
export const EMBED_LOGIN_PATH = '/embed-login';

// calls: config.calls or null. The call service is reached over its WebSocket (signalling)
// and over https at the same host (livekit-client's connection check after a failed
// connect); media flows over WebRTC, which the CSP does not govern. embedAncestors: for an
// /embed/ page, the approved foreign sites (embed/origins.js); its policy differs only in who
// may frame it.
export function cspDirectives(calls, { embedAncestors } = {}) {
  const callOrigins = calls ? [calls.url, calls.httpOrigin] : [];
  return {
    ...CSP_BASE,
    connectSrc: ["'self'", ...callOrigins],
    frameAncestors: embedAncestors ? ["'self'", ...embedAncestors] : CSP_BASE.frameAncestors,
  };
}

// embedOrigins: the approved sites (embed/origins.js); its list() keeps the same array until
// the list changes, so the embed pages' headers are rebuilt only after a change.
export function securityHeaders(config, embedOrigins) {
  const headersFor = (embedAncestors, { opener = false } = {}) =>
    helmet({
      // useDefaults: false so nothing looser than the list above sneaks in.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives(config.calls, { embedAncestors }),
      },
      // X-Frame-Options knows no list of sites; frame-ancestors decides for the embed pages.
      xFrameOptions: embedAncestors ? false : { action: 'sameorigin' },
      referrerPolicy: { policy: 'same-origin' },
      // opener: the login popup must stay reachable from the embed that opened it.
      crossOriginOpenerPolicy: opener ? false : { policy: 'same-origin' },
    });
  const site = headersFor(undefined);
  const loginPopup = headersFor(undefined, { opener: true });
  let embed = { list: null, headers: null };
  const embedHeaders = () => {
    const list = embedOrigins.list();
    if (embed.list !== list) embed = { list, headers: headersFor(list) };
    return embed.headers;
  };
  return (req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    if (req.path.startsWith(EMBED_PREFIX)) return embedHeaders()(req, res, next);
    (req.path === EMBED_LOGIN_PATH ? loginPopup : site)(req, res, next);
  };
}
