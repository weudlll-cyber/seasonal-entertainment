// ============================================================
// File:        create-dev-admin.mjs
// Path:        scripts/create-dev-admin.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev:admin`: prepares the local development admin through the real
//              API (the actual app in-process on a random local port):
//              1. creates it via the bootstrap flow (one-time token held only in memory, sent
//                 in the x-bootstrap-token header) if the database has no admin yet; else
//                 logs in with the password from the file;
//              2. turns on its 2FA (required for admins) if it is off;
//              3. if its 2FA is already on, rewrites the file's 2FA part from the secret stored
//                 now (it may have been set up again since the file was written). It only
//                 reads: devadmin's 2FA is never reset or changed (an authenticator app uses it).
//              The password never goes to the server: like a browser, the script derives the
//              auth key from it with the shared crypto helper (docs/AUTH.md, "Login key split").
//              Password, TOTP secret and recovery codes go ONLY to data/DEV-ADMIN.txt
//              (gitignored). Also adds a SESSION_SECRET to .env so dev logins survive
//              restarts. Safe to run again. Refuses to run with NODE_ENV=production.
// ============================================================

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deriveAccountKeys, newSalt } from '@seasonal-entertainment/shared/crypto.js';
import { countAdmins } from '../server/src/accounts/userStore.js';
import { createApp } from '../server/src/app.js';
import { readBuildInfo } from '../server/src/buildInfo.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';
import { openDatabase } from '../server/src/db/database.js';
import { ISSUER } from '../server/src/twofa/routes.js';
import { openSecret } from '../server/src/twofa/secretBox.js';
import { getTwoFactor } from '../server/src/twofa/store.js';
import { codeForStep, otpauthUrl, stepAt } from '../server/src/twofa/totp.js';

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

// Logs in as the browser does: the account's salt from the pre-login step, then the auth key
// derived from it. Returns the login answer and the auth key (2FA setup asks for the password
// again).
async function logIn(password) {
  const pre = await call('/auth/prelogin', { username: USERNAME });
  const { authKey } = await deriveAccountKeys(password, pre.body.salt);
  return { answer: await call('/auth/login', { username: USERNAME, authKey }), authKey };
}

// The file's 2FA part. recoveryCodes: null when they are not known (stored hashed only).
const TWO_FACTOR_HEADING =
  'Two-factor authentication (required for admins) is ON for this account.';
const twoFactorPart = (secret, otpauthLink, recoveryCodes) =>
  [
    '',
    TWO_FACTOR_HEADING,
    'Add the secret to an authenticator app (manual entry, time-based, 6 digits, 30 s),',
    'or open the otpauth link on the phone. Each recovery code works once.',
    `TOTP secret: ${secret}`,
    `otpauth link: ${otpauthLink}`,
    recoveryCodes
      ? `Recovery codes: ${recoveryCodes.join(' ')}`
      : 'Recovery codes: stored hashed, so not shown again; those from the setup still work once each.',
    '',
  ].join('\n');

// 3. 2FA already on: the file gets the secret as stored now, everything above its 2FA part
// (username, password) kept. Reads the row only; a secret that cannot be used leaves the file.
async function rewriteStoredSecret() {
  const { id } = db.prepare('SELECT id FROM users WHERE username = ?').get(USERNAME);
  const factor = getTwoFactor(db, id);
  const secret = factor?.enabled ? await openSecret(factor.secret, config.secretKey, id) : null;
  if (secret === null) {
    console.log(`The stored 2FA secret of "${USERNAME}" cannot be read; ${file} left as it is.`);
    return;
  }
  const head = readFileSync(file, 'utf8').split(`\n${TWO_FACTOR_HEADING}`)[0].trimEnd();
  const link = otpauthUrl(secret, USERNAME, ISSUER);
  writeFileSync(file, `${head}\n${twoFactorPart(secret, link, null)}`, { mode: 0o600 });
  console.log(`The dev admin already has 2FA; ${file} now holds its stored secret.`);
}

try {
  // 1. The admin account. loggedIn: a full session exists (not just a pending 2FA login).
  // currentAuthKey: proves the account's password again to start the 2FA setup.
  let loggedIn = false;
  let currentAuthKey;
  // Asked first: on a run again, a new password's key derivation (Argon2id) and the server's
  // bcrypt hash of it would be work for a bootstrap that can only answer "an admin exists".
  if (countAdmins(db) === 0) {
    const password = random(18);
    const salt = await newSalt();
    ({ authKey: currentAuthKey } = await deriveAccountKeys(password, salt));
    const created = await call(
      '/auth/bootstrap',
      { username: USERNAME, email: 'devadmin@example.org', salt, authKey: currentAuthKey },
      { 'x-bootstrap-token': config.bootstrapToken }
    );
    if (created.status !== 201) {
      throw new Error(`bootstrap failed: ${created.status} ${created.body.message}`);
    }
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
  } else {
    if (!existsSync(file)) throw new Error(`an admin exists but ${file} is missing`);
    const known = readFileSync(file, 'utf8').match(/^Password: (.+)$/m)?.[1];
    const { answer: login, authKey } = await logIn(known);
    currentAuthKey = authKey;
    if (login.status !== 200) throw new Error(`login as ${USERNAME} failed: ${login.status}`);
    if (login.body.twoFactorRequired) await rewriteStoredSecret();
    loggedIn = !login.body.twoFactorRequired;
  }

  // 2. Its 2FA (skipped when the login above already asked for a code).
  if (loggedIn) {
    const setup = await call('/2fa/setup', { authKey: currentAuthKey });
    if (setup.status !== 200) throw new Error(`2FA setup failed: ${setup.status}`);
    const code = codeForStep(setup.body.secret, stepAt(Date.now()));
    const enable = await call('/2fa/enable', { code });
    if (enable.status !== 200) throw new Error(`2FA enable failed: ${enable.status}`);
    appendFileSync(
      file,
      twoFactorPart(setup.body.secret, setup.body.otpauthUrl, enable.body.recoveryCodes)
    );
    console.log(`2FA turned on for "${USERNAME}"; secret and recovery codes added to ${file}`);
  }
} finally {
  // fetch keeps its connection alive; without this, close() would wait for it forever.
  server.closeAllConnections();
  server.close();
  db.close();
}
