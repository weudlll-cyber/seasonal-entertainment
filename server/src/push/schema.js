// ============================================================
// File:        schema.js
// Path:        server/src/push/schema.js
// Project:     Seasonal Entertainment
// Description: Web push subscriptions (docs/CALLS.md, "Push when a call starts"; decided
//              2026-11-10): one row per member and device that turned the switch on. The
//              browser's push endpoint and its two keys, and the site's public key the
//              subscription was made for (vapid_key): one made for other keys (a restore onto a
//              server with new ones) is never sent to and goes at the next sending. An account's
//              deletion takes its rows with it (ON DELETE CASCADE).
// ============================================================

export const PUSH_SCHEMA = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  vapid_key  TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
`;
