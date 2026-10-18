// ============================================================
// File:        config.js
// Path:        server/src/calls/config.js
// Project:     Seasonal Entertainment
// Description: Reads the call service settings (CALLS_URL, CALLS_API_KEY, CALLS_API_SECRET)
//              at start time. None set: the Calls feature is off ("not configured" for
//              admins, hidden from everyone else). Some but not all set, or a URL that is not
//              a ws(s) origin: the server refuses to start. In production the URL must be
//              wss:// and LiveKit's development key and secret are refused (docs/CALLS.md).
// ============================================================

// What `livekit-server --dev` uses; fine on a developer's machine, never in production.
export const DEV_API_KEY = 'devkey';
export const DEV_API_SECRET = 'secret';
// LiveKit's own advice for a production secret.
const SECRET_MIN = 32;

const fail = (message) => {
  throw new Error(`[calls] ${message}`);
};

// Returns null (feature off) or { url, httpOrigin, apiKey, apiSecret }: url is the wss/ws
// origin browsers connect to; httpOrigin the same host over http(s), which the server SDK
// calls and the browser client uses for its connection check.
export function readCallsConfig(env, isProduction) {
  const url = env.CALLS_URL || '';
  const apiKey = env.CALLS_API_KEY || '';
  const apiSecret = env.CALLS_API_SECRET || '';
  const given = [url, apiKey, apiSecret].filter(Boolean).length;
  if (given === 0) return null;
  if (given < 3) fail('CALLS_URL, CALLS_API_KEY and CALLS_API_SECRET must be set together');

  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    // reported below
  }
  if (
    !parsed ||
    !['ws:', 'wss:'].includes(parsed.protocol) ||
    parsed.origin + '/' !== parsed.href
  ) {
    fail(`CALLS_URL must be a ws:// or wss:// origin without a path, got "${url}"`);
  }
  if (isProduction) {
    if (parsed.protocol !== 'wss:') fail('CALLS_URL must use wss:// in production');
    if (apiKey === DEV_API_KEY || apiSecret === DEV_API_SECRET) {
      fail("LiveKit's development key or secret is not allowed in production");
    }
    if (apiSecret.length < SECRET_MIN) {
      fail(`CALLS_API_SECRET must be at least ${SECRET_MIN} characters in production`);
    }
  }
  const httpOrigin = parsed.origin.replace(/^ws/, 'http');
  return { url: parsed.origin, httpOrigin, apiKey, apiSecret };
}
