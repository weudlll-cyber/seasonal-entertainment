// ============================================================
// File:        pollRules.test.js
// Path:        shared/pollRules.test.js
// Project:     Seasonal Entertainment
// Description: The rules of a poll and a vote (pollRules.js; docs/POLLS.md), the same in the
//              create form, the vote form and on the server: 2 to 10 different answers, an end
//              in the future or none; one answer unless several may be chosen, an "Other
//              answer" only where the poll has one, written answers of at most 500 characters;
//              a ballot of the wrong shape (answers not a list, answers in a text poll, a text
//              that is not text) is refused.
// ============================================================

import { describe, expect, it } from 'vitest';
import { hasFreeText, validatePoll, validateVote } from './pollRules.js';

const POLL = {
  question: 'Which day?',
  kind: 'choice',
  options: ['Friday', 'Saturday'],
  multiple: false,
  otherText: false,
  results: 'after_vote',
  anonymous: false,
  voters: 'members',
  endsAt: null,
};

describe('validatePoll', () => {
  it('accepts a complete poll and names the first problem otherwise', () => {
    expect(validatePoll(POLL)).toBeNull();
    expect(validatePoll({ ...POLL, kind: 'text', options: [] })).toBeNull();
    expect(validatePoll({ ...POLL, question: ' ' })).toBe('Please enter the question.');
    expect(validatePoll({ ...POLL, options: Array(11).fill('x') })).toBe(
      'Please give 2 to 10 answers.'
    );
    expect(validatePoll({ ...POLL, options: ['Yes', 'yes'] })).toBe(
      'Every answer must be different.'
    );
    expect(validatePoll({ ...POLL, voters: 'steps', steps: [] })).toBe(
      'Please choose at least one Discord step.'
    );
    expect(validatePoll({ ...POLL, voters: 'steps', steps: [4] })).toBeNull();
    expect(validatePoll({ ...POLL, voters: 'team' })).toBeNull();
    expect(validatePoll({ ...POLL, anonymous: undefined })).toBe(
      'Please choose whether the poll is anonymous.'
    );
    const now = Date.parse('2026-11-10T18:00:00Z');
    expect(validatePoll({ ...POLL, endsAt: '2026-11-10T17:00:00Z' }, now)).toBe(
      'The end must lie in the future.'
    );
    expect(validatePoll({ ...POLL, endsAt: '2026-11-10T19:00:00Z' }, now)).toBeNull();
  });
});

describe('validateVote', () => {
  const poll = {
    kind: 'choice',
    multiple: false,
    otherText: true,
    options: [{ id: 1 }, { id: 2 }],
  };
  it('one answer, or the other answer, within the poll', () => {
    expect(validateVote(poll, { options: [1], text: '' })).toBeNull();
    expect(validateVote(poll, { options: [], text: 'Monday' })).toBeNull();
    expect(validateVote(poll, { options: [1, 2] })).toBe('Please choose one answer.');
    expect(validateVote(poll, { options: [1], text: 'Monday' })).toBe('Please choose one answer.');
    expect(validateVote(poll, { options: [3] })).toBe('Please choose among the answers.');
    expect(validateVote(poll, { options: [] })).toBe('Please choose an answer.');
    expect(validateVote({ ...poll, otherText: false }, { options: [], text: 'x' })).toBe(
      'This poll has no other answer.'
    );
    expect(validateVote({ ...poll, multiple: true }, { options: [1, 2], text: 'x' })).toBeNull();
  });

  it('a ballot of the wrong shape is refused, never stored (security review L3)', () => {
    const text = { kind: 'text', options: [] };
    // A text poll takes no answers, not even another poll's.
    expect(validateVote(text, { options: [7], text: 'Fine' })).toBe(
      'Please choose among the answers.'
    );
    expect(validateVote(text, { options: {}, text: 'Fine' })).toBe(
      'Please choose among the answers.'
    );
    expect(validateVote(poll, { options: { 0: 1 } })).toBe('Please choose among the answers.');
    // The text, where given, is text.
    expect(validateVote(poll, { options: [1], text: 5 })).toBe('Please write your answer as text.');
    expect(validateVote(text, { text: ['Fine'] })).toBe('Please write your answer as text.');
    expect(validateVote(poll, { options: [1], text: null })).toBeNull();
  });

  it('free text: required and at most 500 characters', () => {
    const text = { kind: 'text', options: [] };
    expect(validateVote(text, { text: 'Fine' })).toBeNull();
    expect(validateVote(text, { text: '' })).toBe('Please write your answer.');
    expect(validateVote(text, { text: 'x'.repeat(501) })).toBe(
      'An answer has at most 500 characters.'
    );
    expect(hasFreeText(text)).toBe(true);
    expect(hasFreeText({ kind: 'choice', otherText: false })).toBe(false);
  });
});
