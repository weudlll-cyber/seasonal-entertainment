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
//              answer only in a poll that is not anonymous. Who may vote (seesPoll, mayVoteIn):
//              all members, members with one of the chosen Discord steps or a higher one, or
//              organisers and admins only, whose polls only they see; and the summary for the
//              sidebar's dot and the home card (pollSummary). A poll started in a call names
//              it (callId, callTitle) and ends with it (endCallPolls).
// ============================================================

import { passesStepRule } from '../discord/steps.js';

const now = () => new Date().toISOString();

const COLUMNS = `p.id, p.question, p.kind, p.multiple, p.other_text AS otherText, p.results,
  p.anonymous, p.voters, p.ends_at AS endsAt, p.ended_at AS endedAt, p.created_at AS createdAt,
  u.username AS createdBy, p.call_id AS callId, c.title AS callTitle`;
const FROM =
  'polls p LEFT JOIN users u ON u.id = p.created_by LEFT JOIN calls c ON c.id = p.call_id';

// Open: not ended by hand and its end time (if any) not reached.
export const isOpen = (poll, at = Date.now()) =>
  !poll.endedAt && (!poll.endsAt || Date.parse(poll.endsAt) > at);

function withOptions(db, row) {
  if (!row) return null;
  const options = db
    .prepare('SELECT id, label FROM poll_options WHERE poll_id = ? ORDER BY position')
    .all(row.id);
  // The steps that may vote, in ladder order (listSteps' order).
  const stepRule = db
    .prepare(
      `SELECT s.id, s.ladder, s.position, s.name FROM poll_step_rules r
       JOIN discord_steps s ON s.id = r.step_id WHERE r.poll_id = ?
       ORDER BY CASE s.ladder WHEN 'holder' THEN 1 WHEN 'farmer' THEN 2 ELSE 3 END, s.position`
    )
    .all(row.id);
  return {
    ...row,
    multiple: Boolean(row.multiple),
    otherText: Boolean(row.otherText),
    anonymous: Boolean(row.anonymous),
    options,
    stepRule,
  };
}

export function findPoll(db, id) {
  return withOptions(db, db.prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE p.id = ?`).get(id));
}

// input: validatePoll's (shared/pollRules.js), already checked. Returns the new poll's id.
export function createPoll(db, input, user) {
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO polls (question, kind, multiple, other_text, results, anonymous, voters,
             ends_at, created_by, created_at, call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.question.trim(),
          input.kind,
          input.kind === 'choice' && input.multiple ? 1 : 0,
          input.kind === 'choice' && input.otherText ? 1 : 0,
          input.results,
          input.anonymous ? 1 : 0,
          input.voters,
          input.endsAt === null ? null : new Date(input.endsAt).toISOString(),
          user.id,
          now(),
          input.callId ?? null
        ).lastInsertRowid
    );
    const add = db.prepare('INSERT INTO poll_options (poll_id, position, label) VALUES (?, ?, ?)');
    if (input.kind === 'choice') input.options.forEach((label, i) => add.run(id, i, label.trim()));
    const rule = db.prepare(
      'INSERT OR IGNORE INTO poll_step_rules (poll_id, step_id) VALUES (?, ?)'
    );
    if (input.voters === 'steps') for (const stepId of input.steps) rule.run(id, stepId);
    return id;
  })();
}

// viewer: { userId (null for a guest), team (organiser or admin), steps (the account's Discord
// steps, discord/steps.js stepsOfUser; read only when a step poll asks) }.
// A team poll is seen by organisers and admins only; every other poll by everyone.
export const seesPoll = (poll, viewer) => poll.voters !== 'team' || viewer.team;

// May this viewer vote at all (open or not)? Organisers and admins always; a step poll: that
// step or a higher one in its ladder (passesStepRule, as the chat rooms), none left: nobody.
export function mayVoteIn(poll, viewer) {
  if (viewer.userId === null) return false;
  if (viewer.team) return true;
  if (poll.voters === 'team') return false;
  if (poll.voters === 'steps') {
    return poll.stepRule.length > 0 && passesStepRule(poll.stepRule, viewer.steps);
  }
  return true;
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

// A call that ends ends its open polls with it (calls/endCall.js); true when any was open.
export function endCallPolls(db, callId) {
  return (
    db
      .prepare('UPDATE polls SET ended_at = ? WHERE call_id = ? AND ended_at IS NULL')
      .run(now(), callId).changes > 0
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
  const { stepRule, ...rest } = poll;
  return {
    ...rest,
    // The steps' names only ("Voting from …"); ladders and positions stay on the server.
    steps: stepRule.map((s) => s.name),
    open,
    votes: voteCount(db, poll.id),
    voted,
    mayVote: mayVoteIn(poll, viewer),
    canVote: mayVoteIn(poll, viewer) && open && (!voted || mayChange(poll, at)),
    myVote: voted && !poll.anonymous ? ownBallot(db, poll, viewer.userId) : null,
    results: seesResults ? resultsOf(db, poll, viewer.team) : null,
  };
}

// Every poll as the viewer sees it: open ones first (soonest end first, then newest), then
// ended ones, newest first.
// callId: only that call's polls (its page), else all.
export function listPolls(db, viewer, at = Date.now(), callId = null) {
  const ids =
    callId === null
      ? db.prepare('SELECT id FROM polls ORDER BY id DESC').all()
      : db.prepare('SELECT id FROM polls WHERE call_id = ? ORDER BY id DESC').all(callId);
  const polls = ids
    .map(({ id }) => findPoll(db, id))
    .filter((poll) => seesPoll(poll, viewer))
    .map((poll) => shownPoll(db, poll, viewer, at));
  const ending = (p) => (p.endsAt ? Date.parse(p.endsAt) : Number.POSITIVE_INFINITY);
  const open = polls.filter((p) => p.open).sort((a, b) => ending(a) - ending(b) || b.id - a.id);
  return [...open, ...polls.filter((p) => !p.open)];
}

// For the sidebar's dot and the home card: how many open polls this viewer may vote in and has
// not yet, and the newest open poll they see (or null).
export function pollSummary(db, viewer, at = Date.now()) {
  const open = listPolls(db, viewer, at).filter((p) => p.open);
  const newest = open.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
  return { unvoted: open.filter((p) => p.canVote && !p.voted).length, newest };
}
