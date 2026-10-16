// ============================================================
// File:        dev.mjs
// Path:        scripts/dev.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev`: starts the API server (port 3800, restarts on change) and the
//              Vite dev server (port 5380, proxies /api) together; stopping it stops both.
// ============================================================

import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

// On Linux each side gets its own process group, so the whole group can be signalled.
const start = (command) => spawn(command, { stdio: 'inherit', shell: true, detached: !isWindows });

const children = [start('npm run dev --workspace server'), start('npm run dev --workspace client')];

// Killing only the shell would leave node/vite running and holding the ports, so the whole
// process tree is stopped: taskkill /T on Windows, the process group elsewhere.
function stopTree(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // The group is already gone.
    }
  }
}

// If either side exits, take the other down too, so nothing is left half-running.
function stopAll(code) {
  children.forEach(stopTree);
  process.exit(code ?? 0);
}

for (const child of children) child.on('exit', stopAll);
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
