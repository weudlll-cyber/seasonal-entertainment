// ============================================================
// File:        accountIds.js
// Path:        server/src/accounts/accountIds.js
// Project:     Seasonal Entertainment
// Description: Account ids are never issued twice (docs/AUTH.md, "Account ids"; decided
//              2026-11-04): games keyed on the id (Seasonal Bingo Royale) must never hand a new
//              account a deleted one's stats. users.id has no AUTOINCREMENT, so SQLite alone would
//              give a new account the id of the newest deleted one. The highest id issued is kept
//              twice: in the database (account_ids, survives deletions and the users table's
//              rebuild) and in a file beside the database file (ISSUED_SUFFIX; the backups copy
//              the database, never this file, so restoring an older backup cannot lower it). A
//              new account gets one more than the highest of both and of users itself.
// ============================================================

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export const ISSUED_SUFFIX = '.issued-account-ids';

// The file beside the database file; none for an in-memory database.
const fileOf = (db) => (db.memory ? null : `${db.name}${ISSUED_SUFFIX}`);

function fromFile(db) {
  const file = fileOf(db);
  if (!file) return 0;
  try {
    return Number.parseInt(readFileSync(file, 'utf8'), 10) || 0;
  } catch {
    return 0; // not written yet
  }
}

// The id the next account gets. Call inside the transaction that inserts it.
export function nextAccountId(db) {
  const stored = db.prepare("SELECT last FROM account_ids WHERE key = 'issued'").get()?.last ?? 0;
  const highest = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM users').get().id;
  return Math.max(stored, highest, fromFile(db)) + 1;
}

// After the insert, in the same transaction. The file is written at once: a transaction that
// is rolled back then leaves it one higher than issued, which only skips an id.
export function noteIssuedId(db, id) {
  db.prepare(
    "INSERT INTO account_ids (key, last) VALUES ('issued', ?) ON CONFLICT (key) DO UPDATE SET last = MAX(last, excluded.last)"
  ).run(id);
  const file = fileOf(db);
  if (!file || fromFile(db) >= id) return;
  // Whole or not at all: a half-written number would read as a lower one.
  writeFileSync(`${file}.tmp`, String(id));
  renameSync(`${file}.tmp`, file);
}
