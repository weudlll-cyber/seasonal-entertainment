// ============================================================
// File:        schema.js
// Path:        server/src/audit/schema.js
// Project:     Seasonal Entertainment
// Description: The audit log: one row per admin or moderation action (who, when, what,
//              before/after as JSON). actor_name is copied, so entries stay readable even if
//              the account is renamed or gone.
// ============================================================

export const AUDIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  target_type TEXT    NOT NULL,
  target_id   TEXT,
  before      TEXT,
  after       TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_newest ON audit_log (id DESC);
`;
