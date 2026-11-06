// ============================================================
// File:        schema.js
// Path:        server/src/accounts/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the accounts area: users, the highest id ever issued and the deleted
//              account changes for the games (ACCOUNT_IDS_SCHEMA, apart from the users table's own
//              schema, which the one-time rebuild below re-runs). Sessions live in the
//              "sessions" table, which the session store creates itself. migrateAccounts() brings
//              older databases up, including the one-time rebuild that made email and the password
//              optional for accounts that log in with Discord (SE-DISCORD-1, docs/AUTH.md).
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

// username/email: COLLATE NOCASE makes uniqueness case-insensitive in the database itself.
// email:           NULL for an account made with Discord (no email is asked there; several
//                  NULLs do not collide under UNIQUE).
// session_epoch: bumped on every password change or reset; a session stamped with an older
//                epoch is no longer valid (pattern from the race game).
// can_start_games: separate permission granted by admins (admins have it implicitly).
// password_hash:   bcrypt of the auth key the browser derives from the password (docs/AUTH.md,
//                  "Login key split"); NULL for an account without a password (made with
//                  Discord and none set yet), which then cannot log in with a password.
// kdf_salt:        the account's random 16-byte salt for that derivation (base64); NULL only
//                  in a database from before the key split, whose accounts cannot log in any
//                  more (an admin's password reset gives them a salt).
// show_online:     whether others see this member as online (the chat; default on).
// dm_link_previews: whether this member's browser asks for link previews while writing a
//                  direct message (docs/CHAT.md; default on, decided 2026-10-22).
// notify_mentions, notify_direct, notify_recap: the browser notifications this member turned
//                  on (a mention, a new direct message, the weekly recap is out; docs/CHAT.md,
//                  "Notifications"; off by default).
export const ACCOUNTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT    UNIQUE COLLATE NOCASE,
  password_hash   TEXT,
  role            TEXT    NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member', 'organiser', 'admin')),
  can_start_games INTEGER NOT NULL DEFAULT 0 CHECK (can_start_games IN (0, 1)),
  locked          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  session_epoch   INTEGER NOT NULL DEFAULT 0,
  kdf_salt        TEXT,
  show_online     INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1)),
  dm_link_previews INTEGER NOT NULL DEFAULT 1 CHECK (dm_link_previews IN (0, 1)),
  notify_mentions INTEGER NOT NULL DEFAULT 0 CHECK (notify_mentions IN (0, 1)),
  notify_direct   INTEGER NOT NULL DEFAULT 0 CHECK (notify_direct IN (0, 1)),
  notify_recap    INTEGER NOT NULL DEFAULT 0 CHECK (notify_recap IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

// account_ids:      the highest account id ever issued (accountIds.js), so an id is never
//                   issued twice: SQLite would give a new account the id of the newest deleted
//                   one (users.id has no AUTOINCREMENT), and a game keyed on it would hand the
//                   new account the deleted one's stats (decided 2026-11-04). One row.
// account_changes:  the account changes the games must learn of (accountChanges.js; GET
//                   /api/games/<slug>/account-changes): user id, kind, time only, kept 365 days.
//                   AUTOINCREMENT: seq is the feed's cursor and must never go back.
export const ACCOUNT_IDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_ids (
  key  TEXT    PRIMARY KEY CHECK (key = 'issued'),
  last INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_changes (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('deleted', 'locked', 'unlocked', 'rights')),
  changed_at TEXT    NOT NULL
);
`;

// Columns that came later. (A "legacy" flag for accounts from before the key split existed
// until SE-NIGHT-2; databases made before then still carry the unused column, harmlessly.)
export function migrateAccounts(db) {
  addMissingColumns(db, [
    ['users', 'kdf_salt', 'TEXT'],
    // Existing accounts keep today's behaviour: shown as online.
    ['users', 'show_online', 'INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1))'],
    ['users', 'dm_link_previews', 'INTEGER NOT NULL DEFAULT 1 CHECK (dm_link_previews IN (0, 1))'],
    ['users', 'notify_mentions', 'INTEGER NOT NULL DEFAULT 0 CHECK (notify_mentions IN (0, 1))'],
    ['users', 'notify_direct', 'INTEGER NOT NULL DEFAULT 0 CHECK (notify_direct IN (0, 1))'],
    ['users', 'notify_recap', 'INTEGER NOT NULL DEFAULT 0 CHECK (notify_recap IN (0, 1))'],
  ]);
  relaxEmailAndPassword(db);
}

// Databases from before Discord logins have email and password_hash NOT NULL. SQLite cannot
// drop a NOT NULL, so the table is rebuilt once from ACCOUNTS_SCHEMA (the documented 12-step
// way: foreign keys off, copy, drop, rename, check) with every row and id kept; the other
// tables' references name "users" and point at the new table afterwards. The check fails only
// on references the rebuild broke: a stray row the database already had (in any table) must not
// keep the server from starting. A database where email is already optional is left alone.
function relaxEmailAndPassword(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.find((c) => c.name === 'email')?.notnull) return;
  const kept = columns
    .map((c) => c.name)
    .filter((name) => name !== 'legacy')
    .join(', ');
  const brokenRefs = () =>
    new Set(db.pragma('foreign_key_check').map((r) => `${r.table}:${r.rowid}:${r.fkid}`));
  const brokenBefore = brokenRefs();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(
        ACCOUNTS_SCHEMA.replace('CREATE TABLE IF NOT EXISTS users', 'CREATE TABLE users_new')
      );
      db.exec(`INSERT INTO users_new (${kept}) SELECT ${kept} FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      const broken = [...brokenRefs()].filter((ref) => !brokenBefore.has(ref));
      if (broken.length) throw new Error(`users rebuild broke ${broken.length} references`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
