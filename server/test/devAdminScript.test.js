// ============================================================
// File:        devAdminScript.test.js
// Path:        server/test/devAdminScript.test.js
// Project:     Seasonal Entertainment
// Description: Guards `npm run dev:admin` (scripts/create-dev-admin.mjs): run on a throw-away
//              database, it creates the admin with 2FA and exits on its own, also a second time;
//              run again with a stale secret in DEV-ADMIN.txt, it writes the stored secret back
//              into the file and leaves the 2FA row exactly as it was. A timer left running
//              would keep it alive: only the time from its last line ("Dev admin ready.") to
//              its exit is limited, so a slow, loaded machine does not count as a hang. Runs
//              at the tests' bcrypt cost, as every
//              other server test (helpers/testApp.js): the hashing strength is not what is
//              tested, and the production cost made each run several times slower.
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/create-dev-admin.mjs', import.meta.url));
let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A throw-away database and media folder in a new temporary folder.
function throwAwayEnv() {
  dir = mkdtempSync(path.join(tmpdir(), 'se-devadmin-'));
  return {
    DATABASE_PATH: path.join(dir, 'seasonal.db'),
    MEDIA_DIR: path.join(dir, 'media'),
    BCRYPT_COST: '4',
  };
}

// The script's last line once its work is done and everything is closed.
const DONE_LINE = 'Dev admin ready.';
// How long the process may take to end after that line. Only this is timed, not the whole run:
// the run starts the whole server app, and loading its modules alone took 7 of its 11 s on an
// idle PC and much longer under load (two runs per test went past a 20 s limit on 2026-11-01).
// Ending after the work is done costs no I/O, so a timer left running stands out from load.
const EXIT_AFTER_DONE_MS = 5_000;
// The whole run's limit, only against a script that never finishes its work.
const RUN_LIMIT_MS = 150_000;

// Resolves the exit code, or "still running" when the process does not end on its own after
// its last line (or never gets there); then it is stopped and awaited: on Windows its open
// database would otherwise block deleting the folder.
function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let result;
    const stop = () => {
      result = 'still running';
      child.kill();
    };
    let timer = setTimeout(stop, RUN_LIMIT_MS);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes(DONE_LINE)) {
        clearTimeout(timer);
        timer = setTimeout(stop, EXIT_AFTER_DONE_MS);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(result ?? code);
    });
  });
}

it(
  'creates the dev admin and exits on its own, twice',
  { timeout: 2 * RUN_LIMIT_MS + 10_000 },
  async () => {
    const env = throwAwayEnv();
    expect(await run(env)).toBe(0);
    expect(readFileSync(path.join(dir, 'DEV-ADMIN.txt'), 'utf8')).toMatch(/TOTP secret: [A-Z2-7]+/);
    expect(await run(env)).toBe(0);
  }
);

it(
  'rewrites a stale secret in the file from the stored one, never touching the 2FA',
  { timeout: 2 * RUN_LIMIT_MS + 10_000 },
  async () => {
    const env = throwAwayEnv();
    const file = path.join(dir, 'DEV-ADMIN.txt');
    const twoFactorRow = () => {
      const db = new Database(env.DATABASE_PATH, { readonly: true });
      try {
        return db.prepare('SELECT * FROM two_factor').all();
      } finally {
        db.close();
      }
    };
    expect(await run(env)).toBe(0);
    const first = readFileSync(file, 'utf8');
    const secret = first.match(/^TOTP secret: (.+)$/m)[1];
    const row = twoFactorRow();
    // As after the account's 2FA was set up again elsewhere: the file's secret is an old one.
    writeFileSync(file, first.replaceAll(secret, 'STALESTALESTALESTALE'));

    expect(await run(env)).toBe(0);
    const second = readFileSync(file, 'utf8');
    expect(second.match(/^TOTP secret: (.+)$/gm)).toEqual([`TOTP secret: ${secret}`]);
    expect(second).toContain(first.match(/^Password: .+$/m)[0]); // the login part is kept
    expect(second).toMatch(/^Recovery codes: stored hashed/m);
    expect(second).not.toContain('STALE');
    expect(twoFactorRow()).toEqual(row); // read only: the same secret, step and dates
  }
);
