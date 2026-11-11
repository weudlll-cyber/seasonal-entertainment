// ============================================================
// File:        restore.js
// Path:        server/src/backup/restore.js
// Project:     Seasonal Entertainment
// Description: Puts one backup (backup.js) back: the database's checksum and SQLite integrity
//              are checked first, then the database and the media folder are copied to the
//              target. Existing data is never overwritten silently: without `force` a target
//              that exists is refused; with it, the old files are moved aside (renamed with
//              ".before-restore-<time>"), never deleted. The site must be stopped while it
//              runs (docs/DEPLOYMENT.md, "Restoring"). Then the call recordings from their own
//              backups (restoreRecordings; each one missing is named). scripts/restore.mjs
//              runs it.
// ============================================================

import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  checkDatabase,
  countFiles,
  DB_FILE,
  MANIFEST,
  MEDIA,
  readJson,
  RECORDINGS,
  sha256Of,
} from './files.js';

// Throws unless the backup in dir is complete and sound; returns its manifest.
export function verifyBackup(dir) {
  const manifestFile = path.join(dir, MANIFEST);
  if (!existsSync(manifestFile)) throw new Error(`${dir} is not a complete backup (no manifest)`);
  const manifest = readJson(manifestFile);
  const database = path.join(dir, DB_FILE);
  if (sha256Of(database) !== manifest.database.sha256) {
    throw new Error(`the database in ${dir} does not match its checksum`);
  }
  checkDatabase(database);
  if (countFiles(path.join(dir, MEDIA)) !== manifest.media.files) {
    throw new Error(`the media folder in ${dir} does not have its ${manifest.media.files} files`);
  }
  return manifest;
}

// Moves an existing file or folder aside; returns the new name (or null if there was none).
function moveAside(target, stamp) {
  if (!existsSync(target)) return null;
  const aside = `${target}.before-restore-${stamp}`;
  renameSync(target, aside);
  return aside;
}

// Returns { manifest, movedAside: [...] }.
export function restoreBackup({
  backupDir,
  databasePath,
  mediaDir,
  force = false,
  now = new Date(),
}) {
  const manifest = verifyBackup(backupDir);
  const taken = [databasePath, mediaDir].filter((target) => existsSync(target));
  if (taken.length && !force) {
    throw new Error(`${taken.join(' and ')} exist: stop the site and restore with --force`);
  }
  const stamp = now.toISOString().replaceAll(':', '-');
  // The old database's write-ahead log goes with it: replayed onto the restored database it
  // would corrupt it, and without it the moved-aside copy would be incomplete.
  const old = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, mediaDir];
  const movedAside = old.map((target) => moveAside(target, stamp)).filter(Boolean);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  copyFileSync(path.join(backupDir, DB_FILE), databasePath);
  cpSync(path.join(backupDir, MEDIA), mediaDir, { recursive: true });
  checkDatabase(databasePath);
  return { manifest, movedAside };
}

// After the database and media are back: the call recordings, from their own backups
// (recordings.js), decrypted on the owner's PC into `fromDir` (or null when none were brought).
// Every finished recording the restored database names is put into media/recordings unless it
// is there already (an archive from before 2026-11-11 still holds them). Returns { restored,
// present, missing }: file names copied now, found in place, and those with no file anywhere,
// which the caller reports (never skipped silently).
export function restoreRecordings({ databasePath, mediaDir, fromDir }) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  let files;
  try {
    files = db
      .prepare('SELECT file FROM call_recordings WHERE stopped_at IS NOT NULL ORDER BY id')
      .all()
      .map((r) => r.file);
  } finally {
    db.close();
  }
  const target = path.join(mediaDir, RECORDINGS);
  mkdirSync(target, { recursive: true });
  const result = { restored: [], present: [], missing: [] };
  for (const file of files) {
    const to = path.join(target, file);
    const from = fromDir ? path.join(fromDir, file) : null;
    if (existsSync(to)) result.present.push(file);
    else if (from && existsSync(from)) {
      copyFileSync(from, to);
      result.restored.push(file);
    } else result.missing.push(file);
  }
  return result;
}
