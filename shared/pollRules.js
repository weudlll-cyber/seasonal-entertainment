// ============================================================
// File:        pollRules.js
// Path:        shared/pollRules.js
// Project:     Seasonal Entertainment
// Description: The rules of a poll (docs/POLLS.md; decided 2026-11-10), checked the same way in
//              the create form and on the server: a question; either 2 to 10 fixed answers
//              (single or multiple choice, optionally with an "Other answer" text) or free text
//              only; free text at most 500 characters; results after the vote or after the
//              end; anonymous or not; who may vote (all members, Discord steps, or organisers
//              and admins only); a fixed end time in the future or "end by hand".
//              validatePoll answers the first problem as a sentence, or null; validateVote
//              does the same for one ballot against its poll, its shape included (answers a
//              list of this poll's ids, none in a text poll; the text a string).
// ============================================================

export const QUESTION_MAX = 200;
export const OPTION_MAX = 100;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 10;
export const TEXT_MAX = 500;
export const KINDS = ['choice', 'text'];
export const RESULTS = ['after_vote', 'after_end'];
// Who may vote: every member, members with one of the chosen Discord steps (or a higher one
// in its ladder), or organisers and admins only (a team poll, seen only by them).
export const VOTERS = ['members', 'steps', 'team'];

const isText = (value) => typeof value === 'string';

// input: { question, kind, options, multiple, otherText, results, anonymous, voters, steps,
// endsAt } (endsAt: an ISO time, or null for "end by hand"; steps: step ids for "steps").
// now: for the end time's check.
export function validatePoll(input, now = Date.now()) {
  const question = isText(input.question) ? input.question.trim() : '';
  if (!question) return 'Please enter the question.';
  if (question.length > QUESTION_MAX) return `The question has at most ${QUESTION_MAX} characters.`;
  if (!KINDS.includes(input.kind)) return 'Please choose how people answer.';
  if (input.kind === 'choice') {
    const options = Array.isArray(input.options) ? input.options : [];
    if (!options.every(isText)) return 'Every answer is text.';
    const labels = options.map((o) => o.trim());
    if (labels.length < OPTIONS_MIN || labels.length > OPTIONS_MAX) {
      return `Please give ${OPTIONS_MIN} to ${OPTIONS_MAX} answers.`;
    }
    if (labels.some((l) => !l)) return 'Every answer needs a text.';
    if (labels.some((l) => l.length > OPTION_MAX)) {
      return `An answer has at most ${OPTION_MAX} characters.`;
    }
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
      return 'Every answer must be different.';
    }
  }
  if (!RESULTS.includes(input.results)) return 'Please choose when the results show.';
  if (typeof input.anonymous !== 'boolean') return 'Please choose whether the poll is anonymous.';
  if (!VOTERS.includes(input.voters)) return 'Please choose who may vote.';
  if (input.voters === 'steps') {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    if (steps.length === 0 || !steps.every(Number.isInteger)) {
      return 'Please choose at least one Discord step.';
    }
  }
  if (input.endsAt !== null) {
    const end = isText(input.endsAt) ? Date.parse(input.endsAt) : Number.NaN;
    if (Number.isNaN(end)) return 'Please choose when the poll ends.';
    if (end <= now) return 'The end must lie in the future.';
  }
  return null;
}

// Free text is enabled: answers that someone has to read and weigh by hand.
export const hasFreeText = (poll) => poll.kind === 'text' || Boolean(poll.otherText);

// ballot: { options: [option ids], text } against poll: { kind, multiple, otherText,
// options: [{ id }] }. Either may be absent (null or undefined); anything else of the wrong
// type is refused, so the server stores only this poll's answer ids and a text (security review
// of 2026-11-13, L3).
export function validateVote(poll, ballot) {
  const given = (value) => value !== undefined && value !== null;
  if (given(ballot.options) && !Array.isArray(ballot.options)) {
    return 'Please choose among the answers.';
  }
  if (given(ballot.text) && !isText(ballot.text)) return 'Please write your answer as text.';
  const text = isText(ballot.text) ? ballot.text.trim() : '';
  const chosen = ballot.options ?? [];
  if (text.length > TEXT_MAX) return `An answer has at most ${TEXT_MAX} characters.`;
  if (poll.kind === 'text') {
    if (chosen.length > 0) return 'Please choose among the answers.';
    return text ? null : 'Please write your answer.';
  }
  const known = new Set(poll.options.map((o) => o.id));
  if (!chosen.every((id) => known.has(id)) || new Set(chosen).size !== chosen.length) {
    return 'Please choose among the answers.';
  }
  if (text && !poll.otherText) return 'This poll has no other answer.';
  if (!poll.multiple && chosen.length + (text ? 1 : 0) > 1) return 'Please choose one answer.';
  if (chosen.length === 0 && !text) return 'Please choose an answer.';
  return null;
}
