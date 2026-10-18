// ============================================================
// File:        schema.js
// Path:        server/src/keys/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the keys area (docs/CHAT.md, "Direct messages"): every member's
//              public keys (a history: a new key pair gets a new id, old ones stay so old
//              direct messages still name the key they were made with), and the current
//              private key, only ever sealed: with the wrapping key derived from the password,
//              and optionally also with a key derived from a recovery code. Nothing here can be
//              opened by the server.
// ============================================================

export const KEYS_SCHEMA = `
CREATE TABLE IF NOT EXISTS user_keys (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS user_keys_by_user ON user_keys (user_id, id);
CREATE TABLE IF NOT EXISTS user_secret_keys (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_id          INTEGER NOT NULL REFERENCES user_keys(id) ON DELETE CASCADE,
  sealed_private  TEXT    NOT NULL,
  recovery_salt   TEXT,
  recovery_sealed TEXT
);
`;
