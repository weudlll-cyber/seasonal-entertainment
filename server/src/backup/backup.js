// ============================================================
// File:        backup.js
// Path:        server/src/backup/backup.js
// Project:     Seasonal Entertainment
// Description: A consistent backup of the site's data while it runs (docs/DEPLOYMENT.md,
//              "Backups"): the SQLite database through SQLite's online backup API (never a
//              file copy, which could catch a write half-way), checked with integrity_check,
//              plus the media folder, into <backupRoot>/<UTC time>/ with a manifest
//              (database checksum, media file count). A backup counts only once complete: it
//              is written under a ".partial" name and renamed at the end. Backups older than
//              14 days are deleted. scripts/backup.mjs runs it; restore.js reads it back.
// ============================================================

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  checkDatabase,
  countFiles,
  DB_FILE,
  MANIFEST,
  MEDIA,
  sha256Of,
  writeJson,
} from './files.js';

export const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// A backup's folder name: its UTC time, sortable and safe in file names (no colons).
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
const stampOf = (date) => date.toISOString().slice(0, 19).replaceAll(':', '-') + 'Z';
const timeOf = (stamp) => Date.parse(stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z/, 'T$1:$2:$3Z'));

// Deletes complete backups older than keepDays and leftovers of failed runs; returns names.
export function pruneBackups(backupRoot, now = new Date(), keepDays = KEEP_DAYS) {
  const pruned = [];
  for (const name of readdirSync(backupRoot)) {
    const old = STAMP.test(name) && now - timeOf(name) > keepDays * DAY_MS;
    if (old || name.endsWith('.partial')) {
      rmSync(path.join(backupRoot, name), { recursive: true, force: true });
      pruned.push(name);
    }
  }
  return pruned;
}

// Returns { dir, manifest, pruned }. Throws (and leaves nothing behind) when the copy fails
// its integrity check.
export async function makeBackup({ databasePath, mediaDir, backupRoot, now = new Date() }) {
  mkdirSync(backupRoot, { recursive: true });
  const name = stampOf(now);
  const partial = path.join(backupRoot, `${name}.partial`);
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial);
  try {
    const target = path.join(partial, DB_FILE);
    const source = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(target); // pages copied in steps; writers are never blocked for long
    } finally {
      source.close();
    }
    checkDatabase(target);
    const media = path.join(partial, MEDIA);
    if (existsSync(mediaDir)) cpSync(mediaDir, media, { recursive: true });
    else mkdirSync(media);
    const manifest = {
      createdAt: now.toISOString(),
      database: { file: DB_FILE, sha256: sha256Of(target) },
      media: { folder: MEDIA, files: countFiles(media) },
    };
    writeJson(path.join(partial, MANIFEST), manifest);
    const dir = path.join(backupRoot, name);
    renameSync(partial, dir);
    // Only after a complete backup exists may older ones go.
    return { dir, manifest, pruned: pruneBackups(backupRoot, now) };
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}
