// ============================================================
// File:        store.js
// Path:        server/src/polls/store.js
// Project:     Seasonal Entertainment
// Description: Polls in the database (docs/POLLS.md; tables in schema.js): creating one,
//              voting (one ballot per account; changed only where the results show after the
//              end, until then, and never in an anonymous poll: nothing links an account to its
//              ballot there), ending early, extending, the anonymous switch before the first
//              vote, deleting; and each poll as one viewer may see it (shownPoll): the results
//              for organisers and admins always, for others after their vote or after the end
//              as the poll says; free-text answers only for organisers and admins; names per
//              answer only in a poll that is not anonymous.
// ============================================================

const now = () => new Date().toISOString();

const COLUMNS = `p.id, p.question, p.kind, p.multiple, p.other_text AS otherText, p.results,
  p.anonymous, p.ends_at AS endsAt, p.ended_at AS endedAt, p.created_at AS createdAt,
  u.username AS createdBy`;

// Open: not ended by hand and its end time (if any) not reached.
export const isOpen = (poll, at = Date.now()) =>
  !poll.endedAt && (!poll.endsAt || Date.parse(poll.endsAt) > at);

function withOptions(db, row) {
  if (!row) return null;
  const options = db
    .prepare('SELECT id, label FROM poll_options WHERE poll_id = ? ORDER BY position')
    .all(row.id);
  return {
    ...row,
    multiple: Boolean(row.multiple),
    otherText: Boolean(row.otherText),
    anonymous: Boolean(row.anonymous),
    options,
  };
}

export function findPoll(db, id) {
  return withOptions(
    db,
    db
      .prepare(
        `SELECT ${COLUMNS} FROM polls p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?`
      )
      .get(id)
  );
}

// input: validatePoll's (shared/pollRules.js), already checked. Returns the new poll's id.
export function createPoll(db, input, user) {
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO polls (question, kind, multiple, other_text, results, anonymous, ends_at,
             created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.question.trim(),
          input.kind,
          input.kind === 'choice' && input.multiple ? 1 : 0,
          input.kind === 'choice' && input.otherText ? 1 : 0,
          input.results,
          input.anonymous ? 1 : 0,
          input.endsAt === null ? null : new Date(input.endsAt).toISOString(),
          user.id,
          now()
        ).lastInsertRowid
    );
    const add = db.prepare('INSERT INTO poll_options (poll_id, position, label) VALUES (?, ?, ?)');
    if (input.kind === 'choice') input.options.forEach((label, i) => add.run(id, i, label.trim()));
    return id;
  })();
}

export const hasVoted = (db, pollId, userId) =>
  Boolean(
    db.prepare('SELECT 1 FROM poll_voters WHERE poll_id = ? AND user_id = ?').get(pollId, userId)
  );

const voteCount = (db, pollId) =>
  db.prepare('SELECT COUNT(*) AS n FROM poll_ballots WHERE poll_id = ?').get(pollId).n;

// A vote may be changed: results after the end, still open, and a ballot that names its account.
export const mayChange = (poll, at = Date.now()) =>
  poll.results === 'after_end' && !poll.anonymous && isOpen(poll, at);

// Stores one ballot (validateVote's, checked): { options, text }. 'voted' when this account
// voted already and may not change it; otherwise null. A change replaces the earlier ballot.
export function castVote(db, poll, userId, ballot) {
  return db.transaction(() => {
    if (hasVoted(db, poll.id, userId)) {
      if (!mayChange(poll)) return 'voted';
      db.prepare('DELETE FROM poll_ballots WHERE poll_id = ? AND user_id = ?').run(poll.id, userId);
    } else {
      db.prepare('INSERT INTO poll_voters (poll_id, user_id) VALUES (?, ?)').run(poll.id, userId);
    }
    const text = ballot.text?.trim() || null;
    const ballotId = db
      .prepare('INSERT INTO poll_ballots (poll_id, user_id, text) VALUES (?, ?, ?)')
      .run(poll.id, poll.anonymous ? null : userId, text).lastInsertRowid;
    const pick = db.prepare('INSERT INTO poll_ballot_options (ballot_id, option_id) VALUES (?, ?)');
    for (const optionId of ballot.options ?? []) pick.run(ballotId, optionId);
    return null;
  })();
}

export function endPoll(db, id) {
  return (
    db.prepare('UPDATE polls SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(now(), id)
      .changes === 1
  );
}

export function extendPoll(db, id, endsAt) {
  db.prepare('UPDATE polls SET ends_at = ? WHERE id = ?').run(new Date(endsAt).toISOString(), id);
}

// Anonymous or not can change only before the first vote; false once someone voted.
export function setAnonymous(db, id, value) {
  return (
    db
      .prepare(
        `UPDATE polls SET anonymous = ? WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM poll_ballots WHERE poll_id = ?)`
      )
      .run(value ? 1 : 0, id, id).changes === 1
  );
}

export function deletePoll(db, id) {
  db.prepare('DELETE FROM polls WHERE id = ?').run(id);
}

// The results: per answer its count (and, not anonymous, who chose it), the other answers'
// and free texts' count, and for organisers and admins the texts themselves.
function resultsOf(db, poll, team) {
  const counts = new Map(
    db
      .prepare(
        `SELECT bo.option_id AS id, COUNT(*) AS n FROM poll_ballot_options bo
         JOIN poll_ballots b ON b.id = bo.ballot_id WHERE b.poll_id = ? GROUP BY bo.option_id`
      )
      .all(poll.id)
      .map((r) => [r.id, r.n])
  );
  const names = new Map();
  if (!poll.anonymous) {
    for (const r of db
      .prepare(
        `SELECT bo.option_id AS id, u.username FROM poll_ballot_options bo
         JOIN poll_ballots b ON b.id = bo.ballot_id JOIN users u ON u.id = b.user_id
         WHERE b.poll_id = ? ORDER BY u.username COLLATE NOCASE`
      )
      .all(poll.id)) {
      names.set(r.id, [...(names.get(r.id) ?? []), r.username]);
    }
  }
  const texts = db
    .prepare(
      `SELECT b.text, u.username AS by FROM poll_ballots b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.poll_id = ? AND b.text IS NOT NULL ORDER BY b.id`
    )
    .all(poll.id);
  return {
    options: poll.options.map((o) => ({
      id: o.id,
      count: counts.get(o.id) ?? 0,
      ...(poll.anonymous ? {} : { voters: names.get(o.id) ?? [] }),
    })),
    textCount: texts.length,
    ...(team
      ? {
          texts: texts.map((t) => (poll.anonymous ? { text: t.text } : { text: t.text, by: t.by })),
        }
      : {}),
  };
}

// This account's own ballot, where it names the account (not in an anonymous poll).
function ownBallot(db, poll, userId) {
  const ballot = db
    .prepare('SELECT id, text FROM poll_ballots WHERE poll_id = ? AND user_id = ?')
    .get(poll.id, userId);
  if (!ballot) return null;
  const options = db
    .prepare('SELECT option_id AS id FROM poll_ballot_options WHERE ballot_id = ?')
    .all(ballot.id)
    .map((r) => r.id);
  return { options, text: ballot.text ?? '' };
}

// viewer: { userId (null for a guest), team (organiser or admin) }.
export function shownPoll(db, poll, viewer, at = Date.now()) {
  const open = isOpen(poll, at);
  const voted = viewer.userId !== null && hasVoted(db, poll.id, viewer.userId);
  const seesResults = viewer.team || !open || (poll.results === 'after_vote' && voted);
  return {
    ...poll,
    open,
    votes: voteCount(db, poll.id),
    voted,
    canVote: viewer.userId !== null && open && (!voted || mayChange(poll, at)),
    myVote: voted && !poll.anonymous ? ownBallot(db, poll, viewer.userId) : null,
    results: seesResults ? resultsOf(db, poll, viewer.team) : null,
  };
}

// Every poll as the viewer sees it: open ones first (soonest end first, then newest), then
// ended ones, newest first.
export function listPolls(db, viewer, at = Date.now()) {
  const ids = db.prepare('SELECT id FROM polls ORDER BY id DESC').all();
  const polls = ids.map(({ id }) => shownPoll(db, findPoll(db, id), viewer, at));
  const ending = (p) => (p.endsAt ? Date.parse(p.endsAt) : Number.POSITIVE_INFINITY);
  const open = polls.filter((p) => p.open).sort((a, b) => ending(a) - ending(b) || b.id - a.id);
  return [...open, ...polls.filter((p) => !p.open)];
}
