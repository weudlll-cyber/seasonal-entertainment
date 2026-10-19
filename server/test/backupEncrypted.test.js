// ============================================================
// File:        backupEncrypted.test.js
// Path:        server/test/backupEncrypted.test.js
// Project:     Seasonal Entertainment
// Description: Encrypted backups (server/src/backup/encrypted.js): a running site's backup,
//              encrypted to an age public key, holds nothing readable; decrypted with the
//              matching private key (as the owner's PC does with the age tool) it is a .tar
//              that restores into a temporary location, sound — integrity check, the same rows,
//              the same files. A private key or no key is refused before anything is written;
//              old encrypted backups are pruned like plain ones; the scripts encrypt by default
//              and restore from the decrypted .tar.
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
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openBackup } from '../src/backup/archive.js';
import { checkDatabase } from '../src/backup/files.js';
import { makeEncryptedBackup } from '../src/backup/encrypted.js';
import { restoreBackup } from '../src/backup/restore.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = new Date('2026-10-19T03:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

let t;
let work;
let identity; // the owner's private key: on the PC only
let recipient; // its public key: what the server gets
beforeEach(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'se-encbackup-'));
  identity = await generateIdentity();
  recipient = await identityToRecipient(identity);
});
afterEach(() => {
  t?.close();
  t = null;
  rmSync(work, { recursive: true, force: true });
});

async function site() {
  t = makeTestApp();
  await registerUser(t, 'anna');
  await registerUser(t, 'ben');
  mkdirSync(path.join(t.config.mediaDir, 'library'), { recursive: true });
  writeFileSync(path.join(t.config.mediaDir, 'library', 'spring.webp'), 'sticker bytes');
  t.db.pragma('wal_checkpoint(TRUNCATE)'); // the scripts open the file from another process
  return { databasePath: t.config.databasePath, mediaDir: t.config.mediaDir };
}
const backupRoot = () => path.join(work, 'backups');
const target = () => ({
  databasePath: path.join(work, 'restored', 'seasonal.db'),
  mediaDir: path.join(work, 'restored', 'media'),
});
const usernames = (file) => {
  const db = new Database(file, { readonly: true });
  const names = db.prepare('SELECT username FROM users ORDER BY id').all();
  db.close();
  return names.map((row) => row.username);
};

// What the owner's PC does: age -d -i key.txt <file> > <file without .age>.
async function decryptOnThePc(file) {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const tar = file.replace(/\.age$/, '');
  writeFileSync(tar, await decrypter.decrypt(readFileSync(file)));
  return tar;
}

it('holds nothing readable, and decrypts into a backup that restores sound', async () => {
  const data = await site();
  const { file, manifest } = await makeEncryptedBackup({
    ...data,
    backupRoot: backupRoot(),
    recipient,
    now: NOW,
  });
  expect(readdirSync(backupRoot())).toEqual(['2026-10-19T03-00-00Z.tar.age']);
  expect(manifest.media.files).toBe(1);
  const sealed = readFileSync(file);
  expect(sealed.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
  for (const plain of ['SQLite format 3', 'anna', 'sticker bytes', 'manifest.json']) {
    expect(sealed.includes(plain)).toBe(false);
  }

  const opened = openBackup(await decryptOnThePc(file));
  try {
    restoreBackup({ backupDir: opened.dir, ...target() });
  } finally {
    opened.cleanup();
  }
  checkDatabase(target().databasePath);
  expect(usernames(target().databasePath)).toEqual(['anna', 'ben']);
  const sticker = path.join(target().mediaDir, 'library', 'spring.webp');
  expect(readFileSync(sticker, 'utf8')).toBe('sticker bytes');
});

it('refuses a private key or no key, before anything is written', async () => {
  const data = await site();
  for (const [key, message] of [
    [identity, /PRIVATE key/],
    ['', /BACKUP_RECIPIENT is not set/],
    ['age1notakey', /./],
  ]) {
    await expect(
      makeEncryptedBackup({ ...data, backupRoot: backupRoot(), recipient: key, now: NOW })
    ).rejects.toThrow(message);
  }
  expect(existsSync(backupRoot())).toBe(false);
});

it('prunes encrypted backups older than 14 days', async () => {
  const data = await site();
  const make = (now) => makeEncryptedBackup({ ...data, backupRoot: backupRoot(), recipient, now });
  await make(new Date(NOW - 15 * DAY_MS));
  await make(new Date(NOW - 13 * DAY_MS));
  const { pruned } = await make(NOW);
  expect(pruned).toEqual(['2026-10-04T03-00-00Z.tar.age']);
  expect(readdirSync(backupRoot()).sort()).toEqual([
    '2026-10-06T03-00-00Z.tar.age',
    '2026-10-19T03-00-00Z.tar.age',
  ]);
});

it('the scripts: encrypted by default, a key required; restore from the decrypted .tar', async () => {
  const data = await site();
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_PATH: data.databasePath,
    MEDIA_DIR: data.mediaDir,
    BACKUP_DIR: backupRoot(),
  };
  delete env.BACKUP_ENCRYPTION;
  const run = (script, args = [], extra = {}) =>
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
      cwd: work, // not the repository: its own .env must not be read
      env: { ...env, ...extra },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  expect(() => run('backup.mjs')).toThrow(/BACKUP_RECIPIENT is not set/);
  expect(run('backup.mjs', [], { BACKUP_RECIPIENT: recipient })).toMatch(
    /\.tar\.age \(encrypted\)/
  );
  const [name] = readdirSync(backupRoot());
  const tar = await decryptOnThePc(path.join(backupRoot(), name));
  expect(run('restore.mjs', [tar, '--check'])).toMatch(/is sound/);
  const restored = target();
  const extra = { DATABASE_PATH: restored.databasePath, MEDIA_DIR: restored.mediaDir };
  expect(run('restore.mjs', [tar], extra)).toMatch(/restored the backup/);
  expect(usernames(restored.databasePath)).toEqual(['anna', 'ben']);
});
