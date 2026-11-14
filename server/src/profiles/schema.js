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
//              account itself. hide_game_results: the member switched "Show my game results"
//              off (games/memberSummary.js; decided 2026-11-14: on by default), added to an
//              older table by migrateProfiles.
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

export const PROFILES_SCHEMA = `
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  about         TEXT    NOT NULL DEFAULT '',
  picture_file  TEXT,
  picture_thumb TEXT,
  picture_mime  TEXT,
  picture_at    TEXT,
  hide_game_results INTEGER NOT NULL DEFAULT 0 CHECK (hide_game_results IN (0, 1)),
  updated_at    TEXT    NOT NULL
);
`;

export function migrateProfiles(db) {
  addMissingColumns(db, [
    [
      'member_profiles',
      'hide_game_results',
      'INTEGER NOT NULL DEFAULT 0 CHECK (hide_game_results IN (0, 1))',
    ],
  ]);
}
