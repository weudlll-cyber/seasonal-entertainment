// ============================================================
// File:        files.js
// Path:        server/src/backup/files.js
// Project:     Seasonal Entertainment
// Description: What backup.js and restore.js share: the layout of one backup folder
//              (database file, media folder, manifest), the checksum, the SQLite integrity
//              check and counting files.
// ============================================================

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';

export const DB_FILE = 'seasonal.db';
export const MEDIA = 'media';
export const MANIFEST = 'manifest.json';
// The call recordings: media/recordings on the site, and the folder of their own backups beside
// the nightly archives (recordings.js). The nightly archive leaves them out (decided
// 2026-11-11): each one is backed up once instead.
export const RECORDINGS = 'recordings';

export const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const writeJson = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

// Throws unless SQLite finds the file sound (PRAGMA integrity_check answers "ok").
export function checkDatabase(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`integrity check of ${file} failed: ${result}`);
  } finally {
    db.close();
  }
}

export function countFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .length;
}
