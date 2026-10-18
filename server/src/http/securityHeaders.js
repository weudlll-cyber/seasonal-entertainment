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
//              (frame-ancestors 'none'), except the embedded chat under /embed/, which only
//              this site's own pages may frame (frame-ancestors 'self'; docs/EMBED.md).
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

// The embedded chat's pages (client/src/embed/): framed by pages of this same origin only.
export const EMBED_PREFIX = '/embed/';

// calls: config.calls or null. The call service is reached over its WebSocket (signalling)
// and over https at the same host (livekit-client's connection check after a failed
// connect); media flows over WebRTC, which the CSP does not govern. embed: the policy of an
// /embed/ page, which differs only in who may frame it.
export function cspDirectives(calls, { embed = false } = {}) {
  const callOrigins = calls ? [calls.url, calls.httpOrigin] : [];
  return {
    ...CSP_BASE,
    connectSrc: ["'self'", ...callOrigins],
    frameAncestors: embed ? ["'self'"] : CSP_BASE.frameAncestors,
  };
}

export function securityHeaders(config) {
  const headersFor = (embed) =>
    helmet({
      // useDefaults: false so nothing looser than the list above sneaks in.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives(config.calls, { embed }),
      },
      referrerPolicy: { policy: 'same-origin' },
    });
  const site = headersFor(false);
  const embed = headersFor(true);
  return (req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    (req.path.startsWith(EMBED_PREFIX) ? embed : site)(req, res, next);
  };
}
