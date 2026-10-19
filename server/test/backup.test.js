// ============================================================
// File:        backup.test.js
// Path:        server/test/backup.test.js
// Project:     Seasonal Entertainment
// Description: Backups (server/src/backup/): a backup of a running site's database (online
//              backup API) and media is restored into a temporary location and found sound —
//              integrity check, the same rows, the same files; backups older than 14 days and
//              leftovers of failed runs are deleted, newer ones kept; a tampered or incomplete
//              backup is refused; existing data is refused without force and moved aside (with
//              its write-ahead log) with it; the two scripts do the same from the command line.
// ============================================================

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEEP_DAYS, makeBackup } from '../src/backup/backup.js';
import { checkDatabase } from '../src/backup/files.js';
import { restoreBackup, verifyBackup } from '../src/backup/restore.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-19T03:00:00.000Z');

let t;
let work; // a temporary folder for backups and restores
beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), 'se-backup-'));
});
afterEach(() => {
  t?.close();
  t = null;
  rmSync(work, { recursive: true, force: true });
});

// A running site with two members and one media file.
async function site() {
  t = makeTestApp();
  await registerUser(t, 'anna');
  await registerUser(t, 'ben');
  mkdirSync(path.join(t.config.mediaDir, 'library'), { recursive: true });
  writeFileSync(path.join(t.config.mediaDir, 'library', 'spring.webp'), 'sticker bytes');
  return { databasePath: t.config.databasePath, mediaDir: t.config.mediaDir };
}
const usernames = (file) => {
  const db = new Database(file, { readonly: true });
  const names = db.prepare('SELECT username FROM users ORDER BY id').all();
  db.close();
  return names.map((row) => row.username);
};
const backupRoot = () => path.join(work, 'backups');
const target = () => ({
  databasePath: path.join(work, 'restored', 'seasonal.db'),
  mediaDir: path.join(work, 'restored', 'media'),
});

it('backs up a running site and restores it, sound, into another place', async () => {
  const data = await site();
  const { dir, manifest } = await makeBackup({ ...data, backupRoot: backupRoot(), now: NOW });
  expect(path.basename(dir)).toBe('2026-10-19T03-00-00Z');
  expect(manifest.media.files).toBe(1);

  const restored = target();
  restoreBackup({ backupDir: dir, ...restored });
  checkDatabase(restored.databasePath);
  expect(usernames(restored.databasePath)).toEqual(['anna', 'ben']);
  const sticker = path.join(restored.mediaDir, 'library', 'spring.webp');
  expect(readFileSync(sticker, 'utf8')).toBe('sticker bytes');
});

it(`keeps ${KEEP_DAYS} days of backups and deletes older ones and failed leftovers`, async () => {
  const data = await site();
  const old = (days) => new Date(NOW - days * DAY_MS);
  await makeBackup({ ...data, backupRoot: backupRoot(), now: old(KEEP_DAYS + 1) });
  await makeBackup({ ...data, backupRoot: backupRoot(), now: old(KEEP_DAYS - 1) });
  mkdirSync(path.join(backupRoot(), '2026-10-18T03-00-00Z.partial'));
  const { pruned } = await makeBackup({ ...data, backupRoot: backupRoot(), now: NOW });
  expect(pruned.sort()).toEqual(['2026-10-04T03-00-00Z', '2026-10-18T03-00-00Z.partial']);
  expect(readdirSync(backupRoot()).sort()).toEqual([
    '2026-10-06T03-00-00Z',
    '2026-10-19T03-00-00Z',
  ]);
});

describe('restoring refuses', () => {
  it('a tampered database and an incomplete backup', async () => {
    const data = await site();
    const { dir } = await makeBackup({ ...data, backupRoot: backupRoot(), now: NOW });
    writeFileSync(path.join(dir, 'seasonal.db'), 'not a database any more');
    expect(() => verifyBackup(dir)).toThrow(/checksum/);
    expect(() => restoreBackup({ backupDir: dir, ...target() })).toThrow(/checksum/);
    expect(existsSync(target().databasePath)).toBe(false);
    rmSync(path.join(dir, 'manifest.json'));
    expect(() => verifyBackup(dir)).toThrow(/not a complete backup/);
  });

  it('existing data without force; with force it is moved aside, log and all', async () => {
    const data = await site();
    const { dir } = await makeBackup({ ...data, backupRoot: backupRoot(), now: NOW });
    const restored = target();
    restoreBackup({ backupDir: dir, ...restored });
    writeFileSync(`${restored.databasePath}-wal`, 'old log');
    expect(() => restoreBackup({ backupDir: dir, ...restored })).toThrow(/--force/);

    const { movedAside } = restoreBackup({ backupDir: dir, ...restored, force: true, now: NOW });
    const stamp = '2026-10-19T03-00-00.000Z';
    // (Its shared-memory file, if SQLite left one, goes too.)
    expect(movedAside.map((p) => path.basename(p))).toEqual(
      expect.arrayContaining([
        `media.before-restore-${stamp}`,
        `seasonal.db-wal.before-restore-${stamp}`,
        `seasonal.db.before-restore-${stamp}`,
      ])
    );
    // The old log is kept beside the old database, never replayed onto the restored one.
    const oldLog = `${restored.databasePath}-wal.before-restore-${stamp}`;
    expect(readFileSync(oldLog, 'utf8')).toBe('old log');
    const log = `${restored.databasePath}-wal`;
    if (existsSync(log)) expect(readFileSync(log, 'utf8')).not.toContain('old log');
    expect(usernames(restored.databasePath)).toEqual(['anna', 'ben']);
  });
});

it('the scripts back up and restore from the command line', async () => {
  const data = await site();
  t.db.pragma('wal_checkpoint(TRUNCATE)'); // the scripts open the file from another process
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_PATH: data.databasePath,
    MEDIA_DIR: data.mediaDir,
    BACKUP_DIR: backupRoot(),
    BACKUP_ENCRYPTION: 'off', // the plain folder; encrypted backups: backupEncrypted.test.js
  };
  const run = (script, args = [], extra = {}) =>
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
      cwd: work, // not the repository: its own .env must not be read
      env: { ...env, ...extra },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  expect(run('backup.mjs')).toMatch(/1 media files; removed 0 old backups/);
  const [name] = readdirSync(backupRoot());
  const dir = path.join(backupRoot(), name);
  expect(run('restore.mjs', [dir, '--check'])).toMatch(/is sound/);
  const restored = target();
  const extra = { DATABASE_PATH: restored.databasePath, MEDIA_DIR: restored.mediaDir };
  expect(run('restore.mjs', [dir], extra)).toMatch(/restored the backup/);
  expect(usernames(restored.databasePath)).toEqual(['anna', 'ben']);
});
