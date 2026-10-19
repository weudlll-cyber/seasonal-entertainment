// ============================================================
// File:        archive.js
// Path:        server/src/backup/archive.js
// Project:     Seasonal Entertainment
// Description: Opening a backup archive for restore.js: an encrypted backup (encrypted.js),
//              decrypted on the owner's PC with the age tool, is a .tar of one backup folder.
//              It is unpacked with the system's tar into a temporary folder; the caller removes
//              that folder again (cleanup). A plain backup folder is used as it is.
// ============================================================

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// source: a backup folder or a .tar of one. Returns { dir, cleanup }.
export function openBackup(source) {
  if (!source.endsWith('.tar')) return { dir: source, cleanup: () => {} };
  const work = mkdtempSync(path.join(tmpdir(), 'se-restore-'));
  const cleanup = () => rmSync(work, { recursive: true, force: true });
  // The archive by its name, from its own folder: GNU tar reads "C:" in an archive name as a
  // remote host (Windows paths); the target folder may be absolute.
  const tar = spawnSync('tar', ['-xf', path.basename(source), '-C', work], {
    cwd: path.dirname(path.resolve(source)),
    encoding: 'utf8',
  });
  const folders = tar.status === 0 ? readdirSync(work) : [];
  if (folders.length !== 1) {
    cleanup();
    throw new Error(
      `${source} is not a backup archive (${tar.stderr?.trim() || 'one folder expected'})`
    );
  }
  return { dir: path.join(work, folders[0]), cleanup };
}
