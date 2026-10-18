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
//              the microphone and screen capture (calls).
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

// calls: config.calls or null. The call service is reached over its WebSocket (signalling)
// and over https at the same host (livekit-client's connection check after a failed
// connect); media flows over WebRTC, which the CSP does not govern.
export function cspDirectives(calls) {
  const callOrigins = calls ? [calls.url, calls.httpOrigin] : [];
  return { ...CSP_BASE, connectSrc: ["'self'", ...callOrigins] };
}

export function securityHeaders(config) {
  const helmetHeaders = helmet({
    // useDefaults: false so nothing looser than the list above sneaks in.
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives(config.calls) },
    referrerPolicy: { policy: 'same-origin' },
  });
  return (req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    helmetHeaders(req, res, next);
  };
}
