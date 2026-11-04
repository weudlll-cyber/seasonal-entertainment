// ============================================================
// File:        schema.js
// Path:        server/src/discord/schema.js
// Project:     Seasonal Entertainment
// Description: Tables of the Discord area (docs/AUTH.md, "Discord"): an account's link to its
//              Discord user (id, name, the refresh token sealed under SECRET_ENCRYPTION_KEY, the
//              role ids last read on the Seasonal Tokens server, when, and its state), the
//              admins' steps (three ladders, each step with its order, the Discord role id that
//              gives it and an icon), and which steps open a chat room (docs/CHAT.md, "Rooms
//              for Discord steps"). Comes after the chat's tables (it names chat_rooms).
// ============================================================

// discord_links: one per account and one per Discord user (both unique).
//   refresh_token:   "enc1:" + the sealed token (discord/tokenBox.js); NULL once Discord refused
//                    it (status needs_login) or after the account was unlinked.
//   status:          member (roles read), not_member (not on the server: no steps),
//                    needs_login (the refresh token is dead: steps hidden until the next Discord
//                    login).
//   role_ids:        JSON array of the Discord role ids last read; steps are computed from it
//                    and the admins' mapping when they are shown, so a mapping change needs no
//                    refresh.
//   next_refresh_at: when the daily job reads the roles again (spread over the day).
//   refreshing_since: set while one refresh runs (a claim: never two at once, discord/refresh.js).
// discord_steps: AUTOINCREMENT, so sqlite_sequence remembers that the list was seeded once
//   (seed.js): an emptied list stays empty.
// room_step_rules: a room with rows here is open (to read and write) only to accounts that have,
//   in any one ladder, at least one of the named steps; staff always pass. A step a room names
//   cannot be removed (RESTRICT): removing it must never open the room.
export const DISCORD_SCHEMA = `
CREATE TABLE IF NOT EXISTS discord_links (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  discord_id       TEXT    NOT NULL UNIQUE,
  discord_name     TEXT    NOT NULL,
  refresh_token    TEXT,
  status           TEXT    NOT NULL DEFAULT 'member'
                           CHECK (status IN ('member', 'not_member', 'needs_login')),
  role_ids         TEXT    NOT NULL DEFAULT '[]',
  linked_at        TEXT    NOT NULL,
  refreshed_at     TEXT,
  next_refresh_at  TEXT    NOT NULL,
  refreshing_since TEXT
);
CREATE INDEX IF NOT EXISTS discord_links_due ON discord_links (next_refresh_at);
CREATE TABLE IF NOT EXISTS discord_steps (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ladder    TEXT    NOT NULL CHECK (ladder IN ('holder', 'farmer', 'investor')),
  name      TEXT    NOT NULL,
  position  INTEGER NOT NULL,
  role_id   TEXT    UNIQUE,
  icon_file TEXT
);
CREATE TABLE IF NOT EXISTS room_step_rules (
  room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES discord_steps(id) ON DELETE RESTRICT,
  PRIMARY KEY (room_id, step_id)
);
`;
