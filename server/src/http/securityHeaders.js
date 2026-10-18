// ============================================================
// File:        securityHeaders.js
// Path:        server/src/http/securityHeaders.js
// Project:     Seasonal Entertainment
// Description: Security response headers (helmet) with a strict Content-Security-Policy.
//              Everything the page loads comes from this origin; nothing inline may run, and no
//              JavaScript eval. WebAssembly may be compiled ('wasm-unsafe-eval'): the browser's
//              cryptography (libsodium, docs/AUTH.md) is WebAssembly, loaded from this origin.
// ============================================================

import helmet from 'helmet';

// The built client uses only same-origin files: scripts and styles from /assets, images
// from /assets or data: URLs (the 2FA QR code), and API/WebSocket calls to this origin.
export const CSP_DIRECTIVES = {
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

export function securityHeaders() {
  return helmet({
    // useDefaults: false so nothing looser than the list above sneaks in.
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    referrerPolicy: { policy: 'same-origin' },
  });
}
