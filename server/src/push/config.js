// ============================================================
// File:        config.js
// Path:        server/src/push/config.js
// Project:     Seasonal Entertainment
// Description: The web push settings (docs/CALLS.md, "Push when a call starts"): the site's
//              VAPID key pair, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url, made once by
//              the installer into site.env, docs/DEPLOYMENT.md). Neither set: push is off (no
//              switch, nothing sent). Only one set, or either not a P-256 key, stops the start,
//              as every other wrong value does. The subject, which tells the push services who
//              sends, is the site's own https address (PUBLIC_ORIGIN); without one (development)
//              a fixed mailto: stands in. Subscriptions are taken only for the browsers' push
//              services (PUSH_SERVICE_HOSTS).
// ============================================================

// The browsers' push services: a subscription's endpoint must be on one of these hosts (or a
// subdomain), over https. The server posts to it, so any other address is refused at
// subscribing: no member can make the server call an address of their choosing.
export const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari, also the site on an iPhone's home screen
  'notify.windows.com', // Edge on Windows
];

const PUBLIC_BYTES = 65; // an uncompressed P-256 point
const PRIVATE_BYTES = 32;
const DEV_SUBJECT = 'mailto:push@seasonal-entertainment.invalid';

const bytes = (value) =>
  /^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, 'base64url').length : 0;

export function readPushConfig(env) {
  const publicKey = env.VAPID_PUBLIC_KEY || null;
  const privateKey = env.VAPID_PRIVATE_KEY || null;
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together: set both or neither');
  }
  if (bytes(publicKey) !== PUBLIC_BYTES || bytes(privateKey) !== PRIVATE_BYTES) {
    throw new Error('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not a base64url P-256 key');
  }
  const origin = env.PUBLIC_ORIGIN || '';
  return {
    publicKey,
    privateKey,
    subject: origin.startsWith('https://') ? origin : DEV_SUBJECT,
    // A "has started" notice is stale after a while: the push service drops it then.
    ttlSeconds: 15 * 60,
    timeoutMs: 10_000,
    // Tests point these at their own fake push service; not an env key.
    endpointHosts: PUSH_SERVICE_HOSTS,
    allowHttp: false,
  };
}
