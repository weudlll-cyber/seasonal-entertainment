// ============================================================
// File:        devAdminScript.test.js
// Path:        server/test/devAdminScript.test.js
// Project:     Seasonal Entertainment
// Description: Guards `npm run dev:admin` (scripts/create-dev-admin.mjs): run on a throw-away
//              database, it creates the admin with 2FA and exits on its own, also a second time
//              (nothing to do). A timer left running would keep it alive until the time-out.
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/create-dev-admin.mjs', import.meta.url));
let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Resolves the exit code, or "still running" after the time-out (then it is stopped).
function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve('still running');
    }, 20_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

it('creates the dev admin and exits on its own, twice', { timeout: 60_000 }, async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-devadmin-'));
  const env = { DATABASE_PATH: path.join(dir, 'seasonal.db'), MEDIA_DIR: path.join(dir, 'media') };
  expect(await run(env)).toBe(0);
  expect(readFileSync(path.join(dir, 'DEV-ADMIN.txt'), 'utf8')).toMatch(/TOTP secret: [A-Z2-7]+/);
  expect(await run(env)).toBe(0);
});
