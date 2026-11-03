// ============================================================
// File:        deletionJournal.test.js
// Path:        server/test/deletionJournal.test.js
// Project:     Seasonal Entertainment
// Description: A restore must not bring back an account deleted after its backup was taken
//              (accounts/deletionJournal.js, docs/DEPLOYMENT.md "Restoring"): both ways of
//              deleting note the account's id, name and time, nothing else, in the journal
//              beside the database, which no backup contains; lines older than 30 days go;
//              after a restore the accounts deleted since the backup go again with their chat
//              uploads and files and are reported, while an account deleted before the
//              backup, another account under the same id and the last admin are left alone.
// ============================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  JOURNAL_DAYS,
  noteDeletion,
  readJournal,
  reapplyDeletions,
} from '../src/accounts/deletionJournal.js';
import { makeBackup } from '../src/backup/backup.js';
import { restoreBackup } from '../src/backup/restore.js';
import { openDatabase } from '../src/db/database.js';
import { proof } from './helpers/accountKeys.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

const DAY_MS = 24 * 60 * 60_000;
let t;
let db; // the restored database
afterEach(() => {
  db?.close(); // first: Windows keeps an open file's folder
  t?.close();
  t = null;
  db = null;
});

const lines = (file) => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const usernames = () =>
  db
    .prepare('SELECT username FROM users ORDER BY id')
    .all()
    .map((u) => u.username);
const backupRoot = () => path.join(path.dirname(t.config.databasePath), 'backups');
const backup = (now = new Date()) =>
  makeBackup({
    databasePath: t.config.databasePath,
    mediaDir: t.config.mediaDir,
    backupRoot: backupRoot(),
    now,
  });

describe('the journal', () => {
  it('notes id, name and time only, beside the database, and drops lines after 30 days', () => {
    t = makeTestApp();
    const file = t.config.deletionJournal;
    expect(path.dirname(file)).toBe(path.dirname(t.config.databasePath));
    const now = new Date('2026-11-02T10:00:00Z');
    const old = new Date(now.getTime() - (JOURNAL_DAYS * DAY_MS + 1));
    noteDeletion(file, { id: 4, username: 'old' }, old);
    noteDeletion(file, { id: 5, username: 'mia', role: 'member', password_hash: 'x' }, now);
    expect(lines(file)).toEqual([{ id: 5, username: 'mia', at: now.toISOString() }]);
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"id": 6, "user`); // a cut write
    expect(readJournal(file, now)).toEqual([{ id: 5, username: 'mia', at: now.toISOString() }]);
  });

  it('both ways of deleting an account note it', async () => {
    t = makeTestApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { user: bert } = await registerUser(t, 'bert');
    const { agent: mia, user: miaUser, password } = await registerUser(t, 'mia');
    expect((await admin.delete(`/api/admin/users/${bert.id}`)).status).toBe(200);
    expect((await mia.delete('/api/auth/account').send(await proof(password))).status).toBe(200);
    expect(lines(t.config.deletionJournal)).toEqual([
      { id: bert.id, username: 'bert', at: expect.any(String) },
      { id: miaUser.id, username: 'mia', at: expect.any(String) },
    ]);
  });

  it('is not in a backup', async () => {
    t = makeTestApp();
    const { user } = await registerUser(t, 'mia');
    noteDeletion(t.config.deletionJournal, user);
    const { dir } = await backup();
    const everything = readdirSync(dir, { recursive: true }).map(String);
    expect(everything.some((name) => name.includes('deletion'))).toBe(false);
  });
});

describe('a restore', () => {
  // ada (admin), mia with an uploaded file and a Discord link, bert; then a backup taken at
  // backupAt.
  async function siteWithBackup(backupAt) {
    t = makeTestApp();
    const { user: ada } = await makeStaff(t, 'ada', 'admin');
    const { user: mia } = await registerUser(t, 'mia');
    const { user: bert } = await registerUser(t, 'bert');
    t.db
      .prepare(
        `INSERT INTO chat_uploads (user_id, kind, name, mime, bytes, file, created_at)
         VALUES (?, 'image', 'mia.webp', 'image/webp', 11, 'uploads/mia.webp', 'now')`
      )
      .run(mia.id);
    t.db
      .prepare(
        `INSERT INTO discord_links (user_id, discord_id, discord_name, refresh_token, role_ids,
           linked_at, next_refresh_at)
         VALUES (?, '600000000000000001', 'mia', 'enc1:sealed', '["1"]', 'now', 'later')`
      )
      .run(mia.id);
    mkdirSync(path.join(t.config.mediaDir, 'uploads'), { recursive: true });
    writeFileSync(path.join(t.config.mediaDir, 'uploads', 'mia.webp'), 'image bytes');
    const { dir } = await backup(backupAt);
    return { ada, mia, bert, backupDir: dir };
  }

  // The site stopped, the backup put back, the journal applied: scripts/restore.mjs's steps.
  function restore(backupDir) {
    const { databasePath, mediaDir, deletionJournal } = t.config;
    t.db.close(); // the site stopped; its folder (backup, journal) stays until afterEach
    const { manifest } = restoreBackup({ backupDir, databasePath, mediaDir, force: true });
    db = openDatabase(databasePath);
    return reapplyDeletions(db, {
      journal: deletionJournal,
      mediaDir,
      takenAt: manifest.createdAt,
    });
  }

  it('deletes again the accounts deleted since the backup, with their files, and reports them', async () => {
    const { mia, bert, backupDir } = await siteWithBackup(new Date(Date.now() - 60_000));
    const { mediaDir, deletionJournal } = t.config;
    noteDeletion(deletionJournal, mia);
    noteDeletion(deletionJournal, bert);
    const report = restore(backupDir);
    expect(usernames()).toEqual(['ada']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM chat_uploads').get().n).toBe(0);
    expect(existsSync(path.join(mediaDir, 'uploads', 'mia.webp'))).toBe(false);
    // Her Discord link (and its sealed token) goes with her account.
    expect(db.prepare('SELECT COUNT(*) AS n FROM discord_links').get().n).toBe(0);
    expect(report.deleted.map((entry) => entry.username)).toEqual(['mia', 'bert']);
    expect(report.kept).toEqual([]);
  });

  it('leaves alone a deletion before the backup, another account under the id, the last admin', async () => {
    const { ada, mia, bert, backupDir } = await siteWithBackup(new Date(Date.now() - 60_000));
    const journal = t.config.deletionJournal;
    noteDeletion(journal, mia, new Date(Date.now() - 2 * 60 * 60_000)); // before the backup
    noteDeletion(journal, { id: bert.id, username: 'someone-else' }); // the id, not the name
    noteDeletion(journal, ada); // the only admin
    const report = restore(backupDir);
    expect(usernames()).toEqual(['ada', 'mia', 'bert']);
    expect(report.deleted).toEqual([]);
    expect(report.kept).toEqual([
      expect.objectContaining({ username: 'ada', reason: 'the last admin of the restored site' }),
    ]);
  });
});
