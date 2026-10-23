// ============================================================
// File:        productionConfig.js
// Path:        server/src/productionConfig.js
// Project:     Seasonal Entertainment
// Description: What production refuses to start with (NODE_ENV=production; config.js calls
//              this after reading everything): development defaults and settings that would be
//              wrong behind the reverse proxy (docs/DEPLOYMENT.md). The call service's keys are
//              checked by calls/config.js.
// ============================================================

// A secret this long is out of reach of guessing; also what LiveKit advises for its own, so the
// call service's secret is held to it too (calls/config.js).
export const SECRET_MIN = 32;

const fail = (message) => {
  throw new Error(`[config] ${message}`);
};

// env: the raw environment; config: what readConfig made of it.
export function checkProduction(env, config) {
  // Behind a reverse proxy: without TRUST_PROXY every visitor would share the proxy's IP (one
  // login limit for all), and without PUBLIC_ORIGIN the origin checks would trust the Host
  // header. Both must be set explicitly; TRUST_PROXY=0 means "nothing in front".
  if (env.TRUST_PROXY === undefined || env.TRUST_PROXY === '') {
    fail('TRUST_PROXY is required in production (number of reverse proxies, 0 if none)');
  }
  let origin = null;
  try {
    origin = new URL(config.publicOrigin);
  } catch {
    // not a URL at all
  }
  if (!origin || origin.origin !== config.publicOrigin) {
    fail('PUBLIC_ORIGIN is required in production: the site origin, e.g. https://example.org');
  }
  // The site is only ever served over HTTPS (Caddy); an http origin means a wrong setup.
  if (origin.protocol !== 'https:') fail('PUBLIC_ORIGIN must use https:// in production');
  if (!config.cookieSecure) fail('COOKIE_SECURE=false is not allowed in production');
  if (config.sessionSecret.length < SECRET_MIN) {
    fail(`SESSION_SECRET must be at least ${SECRET_MIN} characters in production`);
  }
  if (config.bootstrapToken && config.bootstrapToken.length < SECRET_MIN) {
    fail(`BOOTSTRAP_TOKEN must be at least ${SECRET_MIN} characters in production`);
  }
}
