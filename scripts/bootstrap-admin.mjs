// ============================================================
// File:        bootstrap-admin.mjs
// Path:        scripts/bootstrap-admin.mjs
// Project:     Seasonal Entertainment
// Description: Creates the first admin of a running site (docs/DEPLOYMENT.md, "The first
//              admin"): `docker compose exec -T site node scripts/bootstrap-admin.mjs <username>
//              <email>` with the password on standard input. Like a browser, it derives the
//              salt and auth key from the password (shared/crypto.js) and calls
//              POST /api/auth/bootstrap on this machine with BOOTSTRAP_TOKEN in the
//              x-bootstrap-token header; the password itself is never sent. Reads PORT,
//              PUBLIC_ORIGIN and BOOTSTRAP_TOKEN from the environment (the container's).
// ============================================================

import {
  validateEmail,
  validatePassword,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { deriveAccountKeys, newSalt } from '@seasonal-entertainment/shared/crypto.js';

const fail = (message) => {
  console.error(`[bootstrap-admin] ${message}`);
  process.exit(1);
};

const [username, email] = process.argv.slice(2);
if (!username || !email) fail('usage: bootstrap-admin.mjs <username> <email> (password on stdin)');
const { BOOTSTRAP_TOKEN: token, PUBLIC_ORIGIN: origin, PORT: port = '3800' } = process.env;
if (!token) fail('BOOTSTRAP_TOKEN is not set: put it in site.env and restart the site first');
if (!origin) fail('PUBLIC_ORIGIN is not set');

let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
// The browser's own rules (shared/accountRules.js), checked before anything is sent.
const problem = validateUsername(username) ?? validateEmail(email) ?? validatePassword(password);
if (problem) fail(problem);

const salt = await newSalt();
const { authKey } = await deriveAccountKeys(password, salt);
// Straight to the container's own port, as if through the proxy: the site's origin (CSRF
// check) and HTTPS as Caddy reports it.
const res = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: origin,
    'X-Forwarded-Proto': 'https',
    'x-bootstrap-token': token,
  },
  body: JSON.stringify({ username, email, salt, authKey }),
});
const body = await res.json().catch(() => ({}));
if (res.status !== 201) fail(`refused (${res.status}): ${body.message ?? 'no answer'}`);
console.log(`[bootstrap-admin] admin "${body.user.username}" created.`);
console.log('[bootstrap-admin] Next: log in on the site and set up 2FA; then remove');
console.log('[bootstrap-admin] BOOTSTRAP_TOKEN from site.env and restart the site.');
