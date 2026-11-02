// ============================================================
// File:        deletionJournal.js
// Path:        server/src/accounts/deletionJournal.js
// Project:     Seasonal Entertainment
// Description: The journal of deleted accounts (docs/DEPLOYMENT.md, "Restoring"; decided
//              2026-11-02): a restore must not bring back an account deleted after its backup
//              was taken. Each deletion is noted as one JSON line { id, username, at } in a file
//              outside the backup archive (config.deletionJournal, beside the database by
//              default), nothing else, and lines older than 30 days are dropped whenever the
//              file is written. After a restore, reapplyDeletions deletes again every account
//              deleted after the backup was taken that the restored database still has under
//              the same id and name, exactly as the site deletes one (deletion.js), and reports
//              each.
// ============================================================

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { chatAccounts as chatAccountsOf } from '../chat/mount.js';
import { deleteAccount } from './deletion.js';
import { LastAdminError } from './userAdmin.js';

export const JOURNAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

// The entries of the last 30 days; a line that is not one (a cut write) is skipped.
export function readJournal(file, now = new Date()) {
  if (!file || !existsSync(file)) return [];
  const since = now.getTime() - JOURNAL_DAYS * DAY_MS;
  const entries = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (Number.isSafeInteger(entry.id) && Date.parse(entry.at) >= since) entries.push(entry);
    } catch {
      // empty or cut line
    }
  }
  return entries;
}

// Notes one deletion: the account's id and name and the time, no more. Written to a new file
// that replaces the old one, so a crash never leaves half a journal.
export function noteDeletion(file, user, now = new Date()) {
  const entries = [
    ...readJournal(file, now),
    { id: user.id, username: user.username, at: now.toISOString() },
  ];
  writeFileSync(`${file}.new`, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
  renameSync(`${file}.new`, file);
}

// After a restore (the site stopped): every account deleted after takenAt (the backup's time,
// ISO) that db still has with the same id and username is deleted again with its chat data and
// files. An earlier deletion is not in the backup anyway, and an account found under its id and
// name in it would be a newer one (ids are given anew). Returns { deleted: [entry], kept:
// [{ ...entry, reason }] }.
export function reapplyDeletions(db, { journal, mediaDir, takenAt }, now = new Date()) {
  const chatAccounts = chatAccountsOf(db, { mediaDir });
  const deleted = [];
  const kept = [];
  const after = readJournal(journal, now).filter(
    (entry) => Date.parse(entry.at) > Date.parse(takenAt)
  );
  for (const entry of after) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(entry.id);
    if (!user || user.username !== entry.username) continue; // not in this backup
    try {
      // No journal here: the deletion is noted already.
      deleteAccount(db, { chatAccounts }, user);
      deleted.push(entry);
    } catch (error) {
      if (!(error instanceof LastAdminError)) throw error;
      kept.push({ ...entry, reason: 'the last admin of the restored site' });
    }
  }
  return { deleted, kept };
}
