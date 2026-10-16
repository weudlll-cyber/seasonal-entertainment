// ============================================================
// File:        verify.mjs
// Path:        scripts/verify.mjs
// Project:     Seasonal Entertainment
// Description: `npm run verify`: runs every check in a fixed order and prints a summary.
//              CI runs exactly this script, so local green means CI green.
// ============================================================

import { spawnSync } from 'node:child_process';

const STEPS = [
  { name: 'lint', script: 'lint' },
  { name: 'format check', script: 'format:check' },
  { name: 'server tests', script: 'test:server' },
  { name: 'client tests', script: 'test:client' },
  { name: 'build', script: 'build' },
  // The browser test needs the build from the step before.
  { name: 'browser smoke test', script: 'test:e2e', needs: 'build' },
];

const results = new Map();
const started = Date.now();

for (const step of STEPS) {
  if (step.needs && results.get(step.needs)?.status !== 'pass') {
    results.set(step.name, { status: 'skipped', seconds: 0 });
    continue;
  }
  console.log(`\n=== ${step.name} (npm run ${step.script}) ===`);
  const t0 = Date.now();
  // shell: true lets "npm" resolve to npm.cmd on Windows and npm on Linux alike.
  const run = spawnSync(`npm run ${step.script}`, { stdio: 'inherit', shell: true });
  results.set(step.name, {
    status: run.status === 0 ? 'pass' : 'FAIL',
    seconds: (Date.now() - t0) / 1000,
  });
}

console.log('\n=== verify summary ===');
for (const [name, { status, seconds }] of results) {
  console.log(`${status.padEnd(8)} ${name.padEnd(20)} ${seconds.toFixed(1)}s`);
}
const failed = [...results.values()].some((r) => r.status !== 'pass');
console.log(
  `\n${failed ? 'VERIFY FAILED' : 'VERIFY PASSED'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
);
process.exit(failed ? 1 : 0);
