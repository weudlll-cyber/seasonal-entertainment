// ============================================================
// File:        schema.js
// Path:        server/src/twofa/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the two-factor area: each account's TOTP secret and its recovery
//              codes (hashed). Rows go with the account (ON DELETE CASCADE).
// ============================================================

// enabled_at: NULL while setup is pending (secret shown, first code not yet confirmed).
// last_step:  the last accepted 30-second step; codes for it or earlier are refused (replay).
export const TWO_FACTOR_SCHEMA = `
CREATE TABLE IF NOT EXISTS two_factor (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret     TEXT    NOT NULL,
  enabled_at TEXT,
  last_step  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recovery_codes (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT    NOT NULL,
  used_at   TEXT
);
CREATE INDEX IF NOT EXISTS recovery_codes_by_user ON recovery_codes (user_id);
`;
