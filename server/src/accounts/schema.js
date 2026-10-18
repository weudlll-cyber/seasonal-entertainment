// ============================================================
// File:        schema.js
// Path:        server/src/accounts/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the accounts area: users. Sessions live in the "sessions" table,
//              which the session store creates itself. migrateAccounts() brings older
//              databases up (and marks their accounts as legacy logins, docs/AUTH.md).
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

// username/email: COLLATE NOCASE makes uniqueness case-insensitive in the database itself.
// session_epoch: bumped on every password change or reset; a session stamped with an older
//                epoch is no longer valid (pattern from the race game).
// can_start_games: separate permission granted by admins (admins have it implicitly).
// password_hash:   bcrypt of the auth key the browser derives from the password (docs/AUTH.md,
//                  "Login key split"); for a legacy account still bcrypt of the password.
// kdf_salt:        the account's random 16-byte salt for that derivation (base64); NULL only
//                  for legacy accounts.
// legacy:          1 for accounts created before the key split, until their next login.
// show_online:     whether others see this member as online (the chat; default on).
export const ACCOUNTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member', 'organiser', 'admin')),
  can_start_games INTEGER NOT NULL DEFAULT 0 CHECK (can_start_games IN (0, 1)),
  locked          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  session_epoch   INTEGER NOT NULL DEFAULT 0,
  kdf_salt        TEXT,
  legacy          INTEGER NOT NULL DEFAULT 0 CHECK (legacy IN (0, 1)),
  show_online     INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

// Accounts that existed before the key split get the columns, and every one of them is marked
// legacy (in the same step, so it never touches an account created afterwards).
export const migrateAccounts = (db) =>
  addMissingColumns(db, [
    ['users', 'kdf_salt', 'TEXT'],
    [
      'users',
      'legacy',
      'INTEGER NOT NULL DEFAULT 0 CHECK (legacy IN (0, 1))',
      'UPDATE users SET legacy = 1 WHERE kdf_salt IS NULL',
    ],
    // Existing accounts keep today's behaviour: shown as online.
    ['users', 'show_online', 'INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1))'],
  ]);
