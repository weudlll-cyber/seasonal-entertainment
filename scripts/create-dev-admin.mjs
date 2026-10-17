// ============================================================
// File:        create-dev-admin.mjs
// Path:        scripts/create-dev-admin.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev:admin`: prepares the local development admin through the real
//              API (the actual app in-process on a random local port):
//              1. creates it via the bootstrap flow (one-time token held only in memory, sent
//                 in the x-bootstrap-token header) if no admin exists;
//              2. turns on its 2FA (required for admins) if it is off.
//              Password, TOTP secret and recovery codes go ONLY to data/DEV-ADMIN.txt
//              (gitignored). Also adds a SESSION_SECRET to .env so dev logins survive
//              restarts. Safe to run again. Refuses to run with NODE_ENV=production.
// ============================================================

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../server/src/app.js';
import { readBuildInfo } from '../server/src/buildInfo.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';
import { openDatabase } from '../server/src/db/database.js';
import { codeForStep, stepAt } from '../server/src/twofa/totp.js';

const USERNAME = 'devadmin';
const random = (bytes) => randomBytes(bytes).toString('base64url');

if (!existsSync(ENV_FILE) || !/^SESSION_SECRET=./m.test(readFileSync(ENV_FILE, 'utf8'))) {
  appendFileSync(ENV_FILE, `SESSION_SECRET=${random(32)}\n`);
  console.log('Added a SESSION_SECRET to .env');
}
process.loadEnvFile(ENV_FILE);

const config = { ...readConfig(), bootstrapToken: random(24), backgroundJobs: false };
if (config.isProduction) throw new Error('create-dev-admin is for development only');
const file = path.join(path.dirname(config.databasePath), 'DEV-ADMIN.txt');

const db = openDatabase(config.databasePath);
const app = createApp({ buildInfo: readBuildInfo(), config, db });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// Minimal client: JSON, the site's Origin, and the session cookie carried along.
let cookie = '';
async function call(route, body, headers = {}) {
  const res = await fetch(`${origin}/api${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, body: await res.json() };
}

try {
  // 1. The admin account. loggedIn: a full session exists (not just a pending 2FA login).
  let loggedIn = false;
  const password = random(18);
  const created = await call(
    '/auth/bootstrap',
    { username: USERNAME, email: 'devadmin@example.org', password },
    { 'x-bootstrap-token': config.bootstrapToken }
  );
  if (created.status === 201) {
    writeFileSync(
      file,
      [
        'Local development admin (created by npm run dev:admin). Never commit this file.',
        `Username: ${USERNAME}`,
        `Password: ${password}`,
        'Log in at http://localhost:5380/login',
        '',
      ].join('\n'),
      { mode: 0o600 }
    );
    console.log(`Dev admin "${USERNAME}" created; credentials in ${file}`);
    loggedIn = true;
  } else if (created.status === 409) {
    if (!existsSync(file)) throw new Error(`an admin exists but ${file} is missing`);
    const known = readFileSync(file, 'utf8').match(/^Password: (.+)$/m)?.[1];
    const login = await call('/auth/login', { username: USERNAME, password: known });
    if (login.status !== 200) throw new Error(`login as ${USERNAME} failed: ${login.status}`);
    if (login.body.twoFactorRequired) console.log('The dev admin already has 2FA; nothing to do.');
    loggedIn = !login.body.twoFactorRequired;
  } else {
    throw new Error(`bootstrap failed: ${created.status} ${created.body.message}`);
  }

  // 2. Its 2FA (skipped when the login above already asked for a code).
  if (loggedIn) {
    const setup = await call('/2fa/setup');
    if (setup.status !== 200) throw new Error(`2FA setup failed: ${setup.status}`);
    const code = codeForStep(setup.body.secret, stepAt(Date.now()));
    const enable = await call('/2fa/enable', { code });
    if (enable.status !== 200) throw new Error(`2FA enable failed: ${enable.status}`);
    appendFileSync(
      file,
      [
        '',
        'Two-factor authentication (required for admins) is ON for this account.',
        'Add the secret to an authenticator app (manual entry, time-based, 6 digits, 30 s),',
        'or open the otpauth link on the phone. Each recovery code works once.',
        `TOTP secret: ${setup.body.secret}`,
        `otpauth link: ${setup.body.otpauthUrl}`,
        `Recovery codes: ${enable.body.recoveryCodes.join(' ')}`,
        '',
      ].join('\n')
    );
    console.log(`2FA turned on for "${USERNAME}"; secret and recovery codes added to ${file}`);
  }
} finally {
  // fetch keeps its connection alive; without this, close() would wait for it forever.
  server.closeAllConnections();
  server.close();
  db.close();
}
