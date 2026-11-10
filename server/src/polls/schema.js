// ============================================================
// File:        schema.js
// Path:        server/src/polls/schema.js
// Project:     Seasonal Entertainment
// Description: The polls' tables (docs/POLLS.md, "Data"; decided 2026-11-10). A poll with its
//              fixed answers; one ballot per vote (the chosen answers in poll_ballot_options,
//              the free text in its text); poll_voters says who voted, one row per account and
//              poll, which is what keeps it to one vote per account. A ballot names its account
//              (user_id) only in a poll that is not anonymous: in an anonymous one nothing links
//              an account to its ballot, and poll_voters keeps no time and, WITHOUT ROWID, no
//              order of arrival either, so the order of the ballots cannot be matched to it.
//              An account's deletion takes its poll_voters rows and its named ballots with it
//              (ON DELETE CASCADE); a poll's creator becomes unknown (SET NULL).
// ============================================================

export const POLLS_SCHEMA = `
CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY,
  question    TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('choice', 'text')),
  multiple    INTEGER NOT NULL DEFAULT 0 CHECK (multiple IN (0, 1)),
  other_text  INTEGER NOT NULL DEFAULT 0 CHECK (other_text IN (0, 1)),
  results     TEXT    NOT NULL CHECK (results IN ('after_vote', 'after_end')),
  anonymous   INTEGER NOT NULL CHECK (anonymous IN (0, 1)),
  ends_at     TEXT,
  ended_at    TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL
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
`;
