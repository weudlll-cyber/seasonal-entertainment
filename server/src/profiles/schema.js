// ============================================================
// File:        schema.js
// Path:        server/src/profiles/schema.js
// Project:     Seasonal Entertainment
// Description: A member's profile (docs/AUTH.md, "Member profiles"; decided 2026-11-11): the
//              optional "About me" (plain text, at most 300 characters, shared/profileRules.js)
//              and the optional picture (stored like a chat image: media files under uploads/,
//              full size and thumbnail). One row per account that set either; it goes with the
//              account (ON DELETE CASCADE), its files with the chat's account data
//              (chat/accountData.js). Name, role, steps and "member since" come from the
//              account itself.
// ============================================================

export const PROFILES_SCHEMA = `
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  about         TEXT    NOT NULL DEFAULT '',
  picture_file  TEXT,
  picture_thumb TEXT,
  picture_mime  TEXT,
  picture_at    TEXT,
  updated_at    TEXT    NOT NULL
);
`;
