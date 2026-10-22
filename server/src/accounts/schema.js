// ============================================================
// File:        schema.js
// Path:        server/src/accounts/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the accounts area: users. Sessions live in the "sessions" table,
//              which the session store creates itself. migrateAccounts() brings older
//              databases up.
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

// username/email: COLLATE NOCASE makes uniqueness case-insensitive in the database itself.
// session_epoch: bumped on every password change or reset; a session stamped with an older
//                epoch is no longer valid (pattern from the race game).
// can_start_games: separate permission granted by admins (admins have it implicitly).
// password_hash:   bcrypt of the auth key the browser derives from the password (docs/AUTH.md,
//                  "Login key split").
// kdf_salt:        the account's random 16-byte salt for that derivation (base64); NULL only
//                  in a database from before the key split, whose accounts cannot log in any
//                  more (an admin's password reset gives them a salt).
// show_online:     whether others see this member as online (the chat; default on).
// dm_link_previews: whether this member's browser asks for link previews while writing a
//                  direct message (docs/CHAT.md; default on, decided 2026-10-22).
// notify_mentions, notify_direct: the browser notifications this member turned on (a mention,
//                  a new direct message; docs/CHAT.md, "Notifications"; off by default).
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
  show_online     INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1)),
  dm_link_previews INTEGER NOT NULL DEFAULT 1 CHECK (dm_link_previews IN (0, 1)),
  notify_mentions INTEGER NOT NULL DEFAULT 0 CHECK (notify_mentions IN (0, 1)),
  notify_direct   INTEGER NOT NULL DEFAULT 0 CHECK (notify_direct IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

// Columns that came later. (A "legacy" flag for accounts from before the key split existed
// until SE-NIGHT-2; databases made before then still carry the unused column, harmlessly.)
export const migrateAccounts = (db) =>
  addMissingColumns(db, [
    ['users', 'kdf_salt', 'TEXT'],
    // Existing accounts keep today's behaviour: shown as online.
    ['users', 'show_online', 'INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1))'],
    ['users', 'dm_link_previews', 'INTEGER NOT NULL DEFAULT 1 CHECK (dm_link_previews IN (0, 1))'],
    ['users', 'notify_mentions', 'INTEGER NOT NULL DEFAULT 0 CHECK (notify_mentions IN (0, 1))'],
    ['users', 'notify_direct', 'INTEGER NOT NULL DEFAULT 0 CHECK (notify_direct IN (0, 1))'],
  ]);
