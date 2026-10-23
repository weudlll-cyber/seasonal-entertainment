// ============================================================
// File:        coverage.mjs
// Path:        scripts/coverage.mjs
// Project:     Seasonal Entertainment
// Description: `npm run test:coverage`: the unit tests of shared, server and client with line
//              coverage (@vitest/coverage-v8), one report per workspace in coverage/<workspace>/
//              (HTML, gitignored), then the lines covered per workspace. Not part of
//              `npm run verify` or CI; the browser tests are not counted.
// ============================================================

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORKSPACES = ['shared', 'server', 'client'];
const root = path.resolve(import.meta.dirname, '..');

const results = [];
for (const workspace of WORKSPACES) {
  console.log(`\n=== ${workspace} ===`);
  const reports = path.join(root, 'coverage', workspace);
  // shell: true lets "npx" resolve on Windows and Linux alike (as in verify.mjs).
  const run = spawnSync(
    `npx vitest run --coverage.enabled --coverage.provider=v8 ` +
      `--coverage.reportsDirectory="${reports}" --coverage.reporter=html ` +
      `--coverage.reporter=json-summary --coverage.reporter=text-summary`,
    { cwd: path.join(root, workspace), stdio: 'inherit', shell: true }
  );
  let lines = null;
  try {
    const summary = JSON.parse(readFileSync(path.join(reports, 'coverage-summary.json'), 'utf8'));
    lines = summary.total.lines.pct;
  } catch {
    // No summary: the run failed before writing one.
  }
  results.push({ workspace, ok: run.status === 0, lines });
}

console.log('\n=== lines covered ===');
for (const { workspace, ok, lines } of results) {
  const shown = lines === null ? 'no report' : `${lines.toFixed(1)} %`;
  console.log(`${workspace.padEnd(8)} ${shown}${ok ? '' : '  (tests FAILED)'}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
