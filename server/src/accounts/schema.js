// ============================================================
// File:        schema.js
// Path:        server/src/accounts/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the accounts area: users. Sessions live in the "sessions" table,
//              which the session store creates itself.
// ============================================================

// username/email: COLLATE NOCASE makes uniqueness case-insensitive in the database itself.
// session_epoch: bumped on every password change or reset; a session stamped with an older
//                epoch is no longer valid (pattern from the race game).
// can_start_games: separate permission granted by admins (admins have it implicitly).
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
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;
