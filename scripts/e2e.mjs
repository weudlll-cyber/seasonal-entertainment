// ============================================================
// File:        e2e.mjs
// Path:        scripts/e2e.mjs
// Project:     Seasonal Entertainment
// Description: `npm run test:e2e`: runs Playwright with a fresh temporary data directory
//              and deletes it afterwards, so no test account survives a run. Deleting here,
//              after Playwright has exited, works on Windows too: by then the test server
//              that held the database file is gone.
// ============================================================

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'se-e2e-'));
const args = process.argv.slice(2).join(' ');
// shell: true lets "npx" resolve on Windows and Linux alike.
const run = spawnSync(`npx playwright test ${args}`, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SE_E2E_DIR: dir },
});
rmSync(dir, { recursive: true, force: true });
process.exit(run.status ?? 1);
