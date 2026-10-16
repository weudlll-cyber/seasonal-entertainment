// ============================================================
// File:        dev.mjs
// Path:        scripts/dev.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev`: starts the API server (port 3800, restarts on change) and the
//              Vite dev server (port 5380, proxies /api) together; Ctrl+C stops both.
// ============================================================

import { spawn } from 'node:child_process';

const children = [
  spawn('npm run dev --workspace server', { stdio: 'inherit', shell: true }),
  spawn('npm run dev --workspace client', { stdio: 'inherit', shell: true }),
];

// If either side exits, take the other down too, so nothing is left half-running.
function stopAll(code) {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code ?? 0);
}

for (const child of children) child.on('exit', stopAll);
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
