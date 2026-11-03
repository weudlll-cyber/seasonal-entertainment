// ============================================================
// File:        dev-watch.mjs
// Path:        scripts/dev-watch.mjs
// Project:     Seasonal Entertainment
// Description: The API server's restart-on-change in development (`npm run dev`, server
//              workspace): runs the entry file and restarts it when a file in the watched
//              folders really changes, its content (modified time or size) or a file added or
//              removed. Replaces `node --watch`, which on Windows also restarted on a change of
//              the last-access time alone: the first read of a file after an hour (Vite serving
//              shared/, a virus scan, an editor search) restarted the server, the restart's own
//              reads restarted it again, and requests in those seconds failed ("Request
//              failed.", 2026-11-03). node_modules is not watched: after `npm install`, restart
//              `npm run dev` by hand.
//              Usage: node dev-watch.mjs <entry> <folder>...
// ============================================================

import { spawn } from 'node:child_process';
import { readdirSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skipped = (file) => file.split(path.sep).includes('node_modules');

// A file's content as far as a restart cares; null for a folder or a file that is gone.
function fingerprint(file) {
  try {
    const stats = statSync(file);
    return stats.isFile() ? `${stats.mtimeMs}:${stats.size}` : null;
  } catch {
    return null;
  }
}

// changed(file): true when the file differs from the last time it was seen (or from the
// start), and remembers it. An event that leaves content and size alone (last-access time,
// attributes) is false.
export function changeFilter(folders) {
  const known = new Map();
  for (const folder of folders) {
    for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
      const file = path.join(entry.parentPath, entry.name);
      if (entry.isFile() && !skipped(file)) known.set(file, fingerprint(file));
    }
  }
  return (file) => {
    if (skipped(file)) return false;
    const now = fingerprint(file);
    if (now === (known.get(file) ?? null)) return false;
    if (now === null) known.delete(file);
    else known.set(file, now);
    return true;
  };
}

// Runs `node <entry>` in cwd and restarts it after a change; several events within delayMs
// (an editor's save, a git checkout) make one restart. A crashed entry waits for the next
// change, as node --watch did.
export function runWatched({ entry, folders, cwd = process.cwd(), delayMs = 200 }) {
  const absolute = folders.map((folder) => path.resolve(cwd, folder));
  const changed = changeFilter(absolute);
  let child;
  let timer;
  const start = () => {
    child = spawn(process.execPath, [entry], { cwd, stdio: 'inherit' });
  };
  const restart = (file) => {
    console.log(`[watch] ${path.relative(cwd, file)} changed: restarting`);
    if (child.exitCode !== null || child.signalCode !== null) return start();
    child.once('exit', start);
    child.kill();
  };
  const watchers = absolute.map((folder) =>
    watch(folder, { recursive: true }, (_event, name) => {
      if (!name || !changed(path.join(folder, name))) return;
      clearTimeout(timer);
      timer = setTimeout(() => restart(path.join(folder, name)), delayMs);
    })
  );
  start();
  return {
    stop() {
      clearTimeout(timer);
      watchers.forEach((watcher) => watcher.close());
      child.removeAllListeners('exit');
      child.kill();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [entry, ...folders] = process.argv.slice(2);
  const running = runWatched({ entry, folders });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      running.stop();
      process.exit(0);
    });
  }
}
