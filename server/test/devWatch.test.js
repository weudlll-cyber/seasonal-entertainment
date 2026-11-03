// ============================================================
// File:        devWatch.test.js
// Path:        server/test/devWatch.test.js
// Project:     Seasonal Entertainment
// Description: Guards the API server's restart-on-change in development (scripts/dev-watch.mjs,
//              `npm run dev`): a change of a file's last-access time alone (what Windows reports
//              when a file is first read after an hour) does not restart the entry, a written
//              file does, once. node --watch failed the first half (2026-11-03: the restart
//              made a "Set a password" request fail).
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/dev-watch.mjs', import.meta.url));
let dir;
let watcher;
afterEach(async () => {
  if (watcher.exitCode === null) {
    const exited = new Promise((resolve) => watcher.once('exit', resolve));
    watcher.kill();
    await exited;
  }
  // The entry, working in the folder, ends at its next check; until then Windows keeps the
  // folder locked.
  rmSync(dir, { recursive: true, force: true, maxRetries: 100, retryDelay: 100 });
});

// The entry prints a line per start and ends once the watcher is gone, so no process outlives
// the test (killing the watcher on Windows does not end its child).
const ENTRY = `import './lib.js';
console.log('started');
setInterval(() => {
  try { process.kill(process.ppid, 0); } catch { process.exit(0); }
}, 200);
`;

const waitFor = async (check, ms) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('timed out');
};

it('restarts on a written file, not on a read (last-access time)', async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-devwatch-'));
  const lib = path.join(dir, 'lib.js');
  writeFileSync(lib, 'export const a = 1;\n');
  // A whole-millisecond mtime, so setting it again below (a Date) keeps it exactly.
  const mtime = new Date(Math.floor(Date.now() / 1000) * 1000);
  utimesSync(lib, mtime, mtime);
  writeFileSync(path.join(dir, 'entry.mjs'), ENTRY);
  watcher = spawn(process.execPath, [script, 'entry.mjs', '.'], { cwd: dir });
  let output = '';
  watcher.stdout.on('data', (chunk) => (output += chunk));
  const starts = () => output.split('started').length - 1;
  await waitFor(() => starts() === 1, 20_000);

  // As after an hour without a read: only the last-access time moves, content and mtime stay.
  utimesSync(lib, new Date(Date.now() - 2 * 3600_000), mtime);
  expect(statSync(lib).mtimeMs).toBe(mtime.getTime());
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(starts()).toBe(1);

  writeFileSync(lib, 'export const a = 2;\n');
  await waitFor(() => starts() === 2, 20_000);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(starts()).toBe(2);
});
