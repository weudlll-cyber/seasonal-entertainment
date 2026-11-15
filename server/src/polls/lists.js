// ============================================================
// File:        lists.js
// Path:        server/src/polls/lists.js
// Project:     Seasonal Entertainment
// Description: The polls as lists for one viewer (docs/POLLS.md, "API"), each selecting in SQL
//              only what it needs and reading in full only the polls the viewer sees (store.js
//              findPoll, seesPoll, shownPoll): the polls page every open poll and the ended
//              ones a page at a time (pollsPage), a call's page all of its polls (callPolls),
//              the summary for the sidebar's dot and the home card only the open ones
//              (pollSummary; security review of 2026-11-13, L4).
// ============================================================

import { dropEndedLinks, findPoll, seesPoll, shownPoll } from './store.js';

// The polls page's archive comes in pages of this many ended polls.
export const ENDED_PAGE = 20;
// isOpen in SQL, for one moment (an ISO time: ends_at is stored by toISOString, so the strings
// compare as the times do), and its opposite.
const OPEN = 'ended_at IS NULL AND (ends_at IS NULL OR ends_at > ?)';
const ENDED = `NOT (${OPEN})`;

// The polls `where` selects (params for its placeholders), newest first, that the viewer sees
// (seesPoll), at most limit of them: only those are read in full (findPoll).
function seenPolls(db, viewer, where, params, limit = Infinity) {
  const ids = db.prepare(`SELECT id FROM polls WHERE ${where} ORDER BY id DESC`).all(...params);
  const seen = [];
  for (const { id } of ids) {
    if (seen.length === limit) break;
    const poll = findPoll(db, id);
    if (seesPoll(poll, viewer)) seen.push(poll);
  }
  return seen;
}

// A call's polls as the viewer sees them (its page): open ones first, then ended ones, each
// newest first (decided 2026-11-11: the ids come in that order). Not paged: a call has few.
export function callPolls(db, viewer, callId, at = Date.now()) {
  dropEndedLinks(db, at);
  const polls = seenPolls(db, viewer, 'call_id = ?', [callId]).map((poll) =>
    shownPoll(db, poll, viewer, at)
  );
  return [...polls.filter((p) => p.open), ...polls.filter((p) => !p.open)];
}

// The polls page: every open poll the viewer sees, then the ended ones, each newest first.
// from: the id of the oldest ended poll the page shows already (every ended one from there up,
// so a reload drops nothing the viewer has loaded), else the newest ENDED_PAGE. next: the from
// that shows one page more, or null when no older ended poll is left.
export function pollsPage(db, viewer, at = Date.now(), from = null) {
  dropEndedLinks(db, at);
  const when = new Date(at).toISOString();
  const open = seenPolls(db, viewer, OPEN, [when]);
  const ended =
    from === null
      ? seenPolls(db, viewer, ENDED, [when], ENDED_PAGE)
      : seenPolls(db, viewer, `${ENDED} AND id >= ?`, [when, from]);
  const below = ended.at(-1)?.id ?? from;
  const older =
    below === null ? [] : seenPolls(db, viewer, `${ENDED} AND id < ?`, [when, below], ENDED_PAGE);
  return {
    polls: [...open, ...ended].map((poll) => shownPoll(db, poll, viewer, at)),
    next: older.at(-1)?.id ?? null,
  };
}

// For the sidebar's dot and the home card: how many open polls this viewer may vote in and has
// not yet, and the newest open poll they see (or null). Reads the open polls only.
export function pollSummary(db, viewer, at = Date.now()) {
  const open = seenPolls(db, viewer, OPEN, [new Date(at).toISOString()]).map((poll) =>
    shownPoll(db, poll, viewer, at)
  );
  return { unvoted: open.filter((p) => p.canVote && !p.voted).length, newest: open[0] ?? null };
}
