// ============================================================
// File:        dev.mjs
// Path:        scripts/dev.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev`: starts the API server (port 3800, restarts on change) and the
//              Vite dev server (port 5380, proxies /api) together; stopping it stops both.
//              PRICE_BOT_DB and EVENT_BOT_DB not set (neither here nor in .env): they point at
//              the fake bot data of `npm run dev:bot-fixtures` when it exists (docs/BOTS.md).
//              Set to an empty value in .env, a bot stays off (its "not connected" state).
// ============================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ENV_FILE } from '../server/src/config.js';
import { FIXTURE_FILES } from './build-bot-fixtures.mjs';

const isWindows = process.platform === 'win32';

// .env first, as the server reads it, so a value set there (even empty) wins over the fixtures.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
for (const [key, file] of Object.entries(FIXTURE_FILES)) {
  if (process.env[key] === undefined && existsSync(file)) {
    process.env[key] = file;
    console.log(`[dev] ${key} -> fake bot data in ${file}`);
  }
}

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
