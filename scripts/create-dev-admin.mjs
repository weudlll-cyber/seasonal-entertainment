// ============================================================
// File:        create-dev-admin.mjs
// Path:        scripts/create-dev-admin.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev:admin`: creates the local development admin through the real
//              bootstrap flow (the actual app on a random local port, a one-time token that
//              exists only in memory, sent in the x-bootstrap-token header). The random
//              password is written ONLY to data/DEV-ADMIN.txt (gitignored). Also makes sure
//              .env has a SESSION_SECRET, so dev logins survive server restarts.
//              Refuses to run with NODE_ENV=production.
// ============================================================

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../server/src/app.js';
import { readBuildInfo } from '../server/src/buildInfo.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';
import { openDatabase } from '../server/src/db/database.js';

const USERNAME = 'devadmin';
const random = (bytes) => randomBytes(bytes).toString('base64url');

if (!existsSync(ENV_FILE) || !/^SESSION_SECRET=./m.test(readFileSync(ENV_FILE, 'utf8'))) {
  appendFileSync(ENV_FILE, `SESSION_SECRET=${random(32)}\n`);
  console.log('Added a SESSION_SECRET to .env');
}
process.loadEnvFile(ENV_FILE);

const config = { ...readConfig(), bootstrapToken: random(24), backgroundJobs: false };
if (config.isProduction) throw new Error('create-dev-admin is for development only');

const db = openDatabase(config.databasePath);
const app = createApp({ buildInfo: readBuildInfo(), config, db });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const password = random(18);
const res = await fetch(`${origin}/api/auth/bootstrap`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: origin,
    'x-bootstrap-token': config.bootstrapToken,
  },
  body: JSON.stringify({ username: USERNAME, email: 'devadmin@example.org', password }),
});
const answer = await res.json();
// fetch keeps its connection alive; without this, close() would wait for it forever.
server.closeAllConnections();
server.close();
db.close();

if (res.status === 409) {
  console.log('An admin already exists in the dev database; nothing written.');
} else if (res.status !== 201) {
  throw new Error(`bootstrap failed: ${res.status} ${answer.message}`);
} else {
  const file = path.join(path.dirname(config.databasePath), 'DEV-ADMIN.txt');
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
}
