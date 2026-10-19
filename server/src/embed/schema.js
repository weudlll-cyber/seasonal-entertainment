// ============================================================
// File:        schema.js
// Path:        server/src/embed/schema.js
// Project:     Seasonal Entertainment
// Description: Embed tokens (docs/AUTH.md, "Embed tokens"): what lets the chat embedded on an
//              approved foreign site act for a member without third-party cookies. Only a
//              SHA-256 hash of each token is stored, with its account, the site (origin) it
//              was issued for, the account's session epoch then and its expiry. The list of
//              approved sites itself is a site setting (origins.js).
// ============================================================

export const EMBED_SCHEMA = `
CREATE TABLE IF NOT EXISTS embed_tokens (
  id            INTEGER PRIMARY KEY,
  token_hash    TEXT    NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin        TEXT    NOT NULL,
  session_epoch INTEGER NOT NULL,
  created_at    TEXT    NOT NULL,
  expires_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS embed_tokens_by_user ON embed_tokens (user_id);
`;
