// ============================================================
// File:        schema.js
// Path:        server/src/games/schema.js
// Project:     Seasonal Entertainment
// Description: Games hub entries: name, short description, image (a site asset key), status,
//              the game's path under /games/, who may see it, and the order on /games.
// ============================================================

export const GAMES_SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image       TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('available', 'coming_soon', 'maintenance')),
  path        TEXT    NOT NULL UNIQUE,
  visibility  TEXT    NOT NULL CHECK (visibility IN ('everyone', 'members', 'organisers')),
  position    INTEGER NOT NULL DEFAULT 0
);
`;
