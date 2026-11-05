// ============================================================
// File:        schema.js
// Path:        server/src/games/schema.js
// Project:     Seasonal Entertainment
// Description: Games hub entries: name, short description, image (a site asset key), status,
//              the game's path under /games/, who may see it, the order on /games, and the
//              optional URL where the game lists its open sign-ups (docs/OPEN-ROUNDS.md;
//              status_url, added 2026-11-04: migrateGames() adds it to an older table).
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

export const GAMES_SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image       TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('available', 'coming_soon', 'maintenance')),
  path        TEXT    NOT NULL UNIQUE,
  visibility  TEXT    NOT NULL CHECK (visibility IN ('everyone', 'members', 'organisers')),
  position    INTEGER NOT NULL DEFAULT 0,
  status_url  TEXT
);
`;

export function migrateGames(db) {
  addMissingColumns(db, [['games', 'status_url', 'TEXT']]);
}
