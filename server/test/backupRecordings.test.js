// ============================================================
// File:        backupRecordings.test.js
// Path:        server/test/backupRecordings.test.js
// Project:     Seasonal Entertainment
// Description: The call recordings backed up once each (backup/recordings.js, backup/backup.js,
//              backup/restore.js; docs/DEPLOYMENT.md, "Backups"; decided 2026-11-11): the
//              nightly archive leaves media/recordings out; each finished recording is
//              encrypted once to the owner's key (or copied, unencrypted backups), one still
//              recording waits, an unchanged one is not touched again, one written to after its
//              backup is backed up again; a recording deleted on the site keeps its backup for
//              14 days, then it goes; a restore puts the recordings back from their backups and
//              names every one that has none.
// ============================================================

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { makeBackup } from '../src/backup/backup.js';
import { backupRecordings } from '../src/backup/recordings.js';
import { restoreRecordings } from '../src/backup/restore.js';
import { openDatabase } from '../src/db/database.js';

const NOW = new Date('2026-11-11T03:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
let dir;
let databasePath;
let mediaDir;
let backupRoot;
let identity;
let recipient;

// The site's data: a call with a finished recording (a.mp4) and one still recording (b.mp4),
// both files in media/recordings, and one other media file.
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-rec-backup-'));
  databasePath = path.join(dir, 'site.db');
  mediaDir = path.join(dir, 'media');
  backupRoot = path.join(dir, 'backups');
  const db = openDatabase(databasePath);
  const callId = db
    .prepare(
      "INSERT INTO calls (title, created_at, room_name) VALUES ('Town hall', 'now', 'room-1')"
    )
    .run().lastInsertRowid;
  const add = db.prepare(
    `INSERT INTO call_recordings (call_id, egress_id, file, started_at, stopped_at, started_by)
     VALUES (?, 'e', ?, 'then', ?, 'olga')`
  );
  add.run(callId, 'a.mp4', 'later');
  add.run(callId, 'b.mp4', null);
  db.close();
  mkdirSync(path.join(mediaDir, 'recordings'), { recursive: true });
  mkdirSync(path.join(mediaDir, 'stickers'), { recursive: true });
  writeFileSync(path.join(mediaDir, 'recordings', 'a.mp4'), 'recording A');
  writeFileSync(path.join(mediaDir, 'recordings', 'b.mp4'), 'recording B, still growing');
  writeFileSync(path.join(mediaDir, 'stickers', 'x.png'), 'sticker');
  identity = await generateIdentity();
  recipient = await identityToRecipient(identity);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const backupOf = (name) => path.join(backupRoot, 'recordings', name);
const decrypt = async (file) => {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  return Buffer.from(await decrypter.decrypt(readFileSync(file))).toString();
};
const run = (at = NOW, key = recipient) =>
  backupRecordings({ databasePath, mediaDir, backupRoot, recipient: key, now: at });

it('the nightly archive leaves the recordings out', async () => {
  const { dir: made, manifest } = await makeBackup({
    databasePath,
    mediaDir,
    backupRoot,
    now: NOW,
  });
  expect(existsSync(path.join(made, 'media', 'stickers', 'x.png'))).toBe(true);
  expect(existsSync(path.join(made, 'media', 'recordings'))).toBe(false);
  expect(manifest.media.files).toBe(1);
});

it('each finished recording once, encrypted; a running one waits; a changed one again', async () => {
  let result = await run();
  expect(result).toMatchObject({ added: ['a.mp4'], waiting: ['b.mp4'], kept: [], again: [] });
  expect(await decrypt(backupOf('a.mp4.age'))).toBe('recording A');
  expect(existsSync(backupOf('b.mp4.age'))).toBe(false);

  // The next night: a.mp4 untouched; b.mp4 has finished meanwhile.
  const db = openDatabase(databasePath);
  db.prepare("UPDATE call_recordings SET stopped_at = 'now' WHERE file = 'b.mp4'").run();
  db.close();
  result = await run(new Date(NOW.getTime() + DAY_MS));
  expect(result).toMatchObject({ added: ['b.mp4'], kept: ['a.mp4'], waiting: [] });

  // a.mp4 written to after its backup (the egress finishing late): backed up once more.
  writeFileSync(path.join(mediaDir, 'recordings', 'a.mp4'), 'recording A, complete');
  const later = new Date(Date.now() + 60_000);
  utimesSync(path.join(mediaDir, 'recordings', 'a.mp4'), later, later);
  result = await run(new Date(NOW.getTime() + 2 * DAY_MS));
  expect(result.again).toEqual(['a.mp4']);
  expect(await decrypt(backupOf('a.mp4.age'))).toBe('recording A, complete');
});

it('a recording deleted on the site keeps its backup for 14 days, then it goes', async () => {
  await run();
  rmSync(path.join(mediaDir, 'recordings', 'a.mp4'));
  let result = await run(new Date(NOW.getTime() + DAY_MS));
  expect(result.pruned).toEqual([]);
  expect(existsSync(backupOf('a.mp4.age'))).toBe(true);
  expect(existsSync(backupOf('a.mp4.age.gone'))).toBe(true);
  result = await run(new Date(NOW.getTime() + 14 * DAY_MS));
  expect(result.pruned).toEqual([]);
  result = await run(new Date(NOW.getTime() + 16 * DAY_MS));
  expect(result.pruned).toEqual(['a.mp4.age']);
  expect(existsSync(backupOf('a.mp4.age'))).toBe(false);
  expect(existsSync(backupOf('a.mp4.age.gone'))).toBe(false);
});

it('unencrypted backups copy the recording as it is; a private key is refused', async () => {
  expect((await run(NOW, null)).added).toEqual(['a.mp4']);
  expect(readFileSync(backupOf('a.mp4'), 'utf8')).toBe('recording A');
  await expect(run(NOW, 'AGE-SECRET-KEY-1QQQQ')).rejects.toThrow(/PRIVATE key/);
});

it('a restore puts recordings back from their backups and names each missing one', () => {
  const db = openDatabase(databasePath);
  db.prepare("UPDATE call_recordings SET stopped_at = 'now' WHERE file = 'b.mp4'").run();
  db.close();
  // The site after the archive's restore: no recordings; the PC brought back a.mp4 only.
  rmSync(path.join(mediaDir, 'recordings'), { recursive: true });
  const brought = path.join(dir, 'brought');
  mkdirSync(brought);
  writeFileSync(path.join(brought, 'a.mp4'), 'recording A');
  const result = restoreRecordings({ databasePath, mediaDir, fromDir: brought });
  expect(result).toEqual({ restored: ['a.mp4'], present: [], missing: ['b.mp4'] });
  expect(readFileSync(path.join(mediaDir, 'recordings', 'a.mp4'), 'utf8')).toBe('recording A');
  // Again, without a folder: a.mp4 is in place, b.mp4 still missing.
  expect(restoreRecordings({ databasePath, mediaDir, fromDir: null })).toEqual({
    restored: [],
    present: ['a.mp4'],
    missing: ['b.mp4'],
  });
});
