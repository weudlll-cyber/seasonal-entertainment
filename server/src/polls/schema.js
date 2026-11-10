// ============================================================
// File:        schema.js
// Path:        server/src/polls/schema.js
// Project:     Seasonal Entertainment
// Description: The polls' tables (docs/POLLS.md, "Data"; decided 2026-11-10). A poll with its
//              fixed answers and who may vote (all members, Discord steps in poll_step_rules,
//              or organisers and admins only, "team"), and the call it was started in, if
//              any; one ballot per vote (the chosen answers
//              in poll_ballot_options, the free text in its text); poll_voters says who voted,
//              one row per account and
//              poll, which is what keeps it to one vote per account. A ballot names its account
//              (user_id) only in a poll that is not anonymous: in an anonymous one nothing links
//              an account to its ballot, and poll_voters keeps no time and, WITHOUT ROWID, no
//              order of arrival either, so the order of the ballots cannot be matched to it.
//              An account's deletion takes its poll_voters rows and its named ballots with it
//              (ON DELETE CASCADE); a poll's creator becomes unknown (SET NULL). An anonymous
//              poll with results after the end links ballots to accounts only while it is open
//              (poll_ballot_links). migratePolls() brings an older polls table up to date.
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

export const POLLS_SCHEMA = `
CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY,
  question    TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('choice', 'text')),
  multiple    INTEGER NOT NULL DEFAULT 0 CHECK (multiple IN (0, 1)),
  other_text  INTEGER NOT NULL DEFAULT 0 CHECK (other_text IN (0, 1)),
  results     TEXT    NOT NULL CHECK (results IN ('after_vote', 'after_end')),
  anonymous   INTEGER NOT NULL CHECK (anonymous IN (0, 1)),
  voters      TEXT    NOT NULL DEFAULT 'members' CHECK (voters IN ('members', 'steps', 'team')),
  ends_at     TEXT,
  ended_at    TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL,
  -- Started in a live call (piece 4): shown on its page, ended with it; a deleted call leaves
  -- the poll on the Polls page without its call.
  call_id     INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  -- Started in a chat room (2026-11-11): its card in the room's timeline; seen only by those
  -- who may read the room; goes with the room.
  room_id     INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE
);
-- "Who may vote: Discord steps": that step or a higher one in its ladder (discord/steps.js).
-- A step deleted later leaves the poll (CASCADE); with none left only staff may vote.
CREATE TABLE IF NOT EXISTS poll_step_rules (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES discord_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (poll_id, step_id)
);
CREATE TABLE IF NOT EXISTS poll_options (
  id       INTEGER PRIMARY KEY,
  poll_id  INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS poll_options_by_poll ON poll_options (poll_id);
CREATE TABLE IF NOT EXISTS poll_ballots (
  id      INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  text    TEXT
);
CREATE INDEX IF NOT EXISTS poll_ballots_by_poll ON poll_ballots (poll_id);
CREATE INDEX IF NOT EXISTS poll_ballots_by_user ON poll_ballots (user_id);
CREATE TABLE IF NOT EXISTS poll_ballot_options (
  ballot_id INTEGER NOT NULL REFERENCES poll_ballots(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  PRIMARY KEY (ballot_id, option_id)
);
CREATE TABLE IF NOT EXISTS poll_voters (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (poll_id, user_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS poll_voters_by_user ON poll_voters (user_id);
-- An anonymous poll whose results show after the end (decided 2026-11-11): which ballot is
-- whose, kept only while the poll is open so its voters may change their vote until the end.
-- Never sent anywhere; every row of a poll goes the moment it ends (store.js dropEndedLinks).
CREATE TABLE IF NOT EXISTS poll_ballot_links (
  poll_id   INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ballot_id INTEGER NOT NULL REFERENCES poll_ballots(id) ON DELETE CASCADE,
  PRIMARY KEY (poll_id, user_id)
) WITHOUT ROWID;
-- An account deleted while such a link exists takes its ballot (and written answer) along; the
-- trigger runs before the link row itself goes with the account.
CREATE TRIGGER IF NOT EXISTS poll_links_account_gone BEFORE DELETE ON users BEGIN
  DELETE FROM poll_ballots
  WHERE id IN (SELECT ballot_id FROM poll_ballot_links WHERE user_id = OLD.id);
END;
`;

// Columns added after a polls table was first created (a development database that ran an
// earlier state of the branch), then the indexes on them.
export function migratePolls(db) {
  addMissingColumns(db, [
    [
      'polls',
      'voters',
      "TEXT NOT NULL DEFAULT 'members' CHECK (voters IN ('members', 'steps', 'team'))",
    ],
    ['polls', 'call_id', 'INTEGER REFERENCES calls(id) ON DELETE SET NULL'],
    ['polls', 'room_id', 'INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE'],
  ]);
  db.exec(`CREATE INDEX IF NOT EXISTS polls_by_call ON polls (call_id);
    CREATE INDEX IF NOT EXISTS polls_by_room ON polls (room_id);`);
}
