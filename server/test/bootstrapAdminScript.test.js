// ============================================================
// File:        bootstrapAdminScript.test.js
// Path:        server/test/bootstrapAdminScript.test.js
// Project:     Seasonal Entertainment
// Description: scripts/bootstrap-admin.mjs against a running site: with the right token it
//              creates the first admin, who then logs in with that password (only a salt and
//              auth key were sent); a wrong token is refused; a password the browser's rules
//              refuse is never sent.
// ============================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { keysFor } from './helpers/accountKeys.js';
import { ORIGIN, makeTestApp } from './helpers/testApp.js';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'bootstrap-admin.mjs'
);
const TOKEN = 'a-bootstrap-token-of-at-least-32-chars';
const PASSWORD = 'correct-horse-1';

let t;
let server;
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  t.close();
});

async function runningSite() {
  t = makeTestApp({ bootstrapToken: TOKEN });
  server = t.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server.address().port;
}

// Runs the script with the password on stdin; resolves { code, out }.
function bootstrap(port, { token = TOKEN, password = PASSWORD } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, 'boss', 'boss@example.org'], {
      env: { ...process.env, PORT: String(port), PUBLIC_ORIGIN: ORIGIN, BOOTSTRAP_TOKEN: token },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(`${password}\n`);
  });
}

const admins = () => t.db.prepare("SELECT username FROM users WHERE role = 'admin'").all();

it('creates the first admin, who logs in with that password', async () => {
  const port = await runningSite();
  const { code, out } = await bootstrap(port);
  expect(out).toMatch(/admin "boss" created/);
  expect(code).toBe(0);
  expect(admins()).toEqual([{ username: 'boss' }]);
  // As a browser logs in: the account's own (random) salt from the pre-login step.
  const agent = t.client();
  const { salt } = (await agent.post('/api/auth/prelogin').send({ username: 'boss' })).body;
  const { authKey } = await keysFor(PASSWORD, salt);
  expect((await agent.post('/api/auth/login').send({ username: 'boss', authKey })).status).toBe(
    200
  );
});

it('is refused with a wrong token, and sends nothing for a refused password', async () => {
  const port = await runningSite();
  const wrong = await bootstrap(port, { token: 'not-the-token' });
  expect(wrong.code).toBe(1);
  expect(wrong.out).toMatch(/refused \(403\)/);
  const short = await bootstrap(port, { password: 'short' });
  expect(short.code).toBe(1);
  expect(short.out).toMatch(/at least 10 characters/);
  expect(admins()).toEqual([]);
});
