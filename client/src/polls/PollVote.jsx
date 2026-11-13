// ============================================================
// File:        PollVote.jsx
// Path:        client/src/polls/PollVote.jsx
// Project:     Seasonal Entertainment
// Description: The vote form of one open poll (PollCard.jsx; docs/POLLS.md): one answer (radio
//              buttons) or several (checkboxes), the "Other answer" text where the poll has
//              one, or only a text; at most 500 characters, checked like the server
//              (shared/pollRules.js validateVote). A poll that is not anonymous says so (names
//              go to signed-in members only) before anyone votes. A vote that may still change
//              starts from the member's own one. On a phone the text field and "Vote" stay
//              above the keyboard (aboveKeyboard.js).
//              onVoted(): after the vote was stored.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { TEXT_MAX, validateVote } from '@seasonal-entertainment/shared/pollRules.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { keepAboveKeyboard } from './aboveKeyboard.js';

export default function PollVote({ poll, onVoted }) {
  const [chosen, setChosen] = useState(poll.myVote?.options ?? []);
  const [text, setText] = useState(poll.myVote?.text ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submitButton = useRef(null);
  const stopFollowing = useRef(null);
  useEffect(() => () => stopFollowing.current?.(), []);
  const name = `poll-${poll.id}`;

  function toggle(id, on) {
    setChosen((now) => (poll.multiple ? (on ? [...now, id] : now.filter((x) => x !== id)) : [id]));
    // One answer only: choosing a fixed one clears the other answer.
    if (!poll.multiple && on) setText('');
  }

  async function submit(event) {
    event.preventDefault();
    const ballot = { options: chosen, text };
    const problem = validateVote(poll, ballot);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await api(`/polls/${poll.id}/vote`, { method: 'POST', body: ballot });
      setError(null);
      onVoted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="poll-vote" onSubmit={submit} aria-label={`Vote: ${poll.question}`}>
      {!poll.anonymous && (
        <p className="poll-vote__named">
          This poll is not anonymous – your name will be shown to signed-in members.
        </p>
      )}
      {poll.kind === 'choice' && (
        <fieldset className="poll-vote__options" aria-label="Answers">
          {poll.options.map((option) => (
            <label key={option.id} className="form-check">
              <input
                type={poll.multiple ? 'checkbox' : 'radio'}
                name={name}
                checked={chosen.includes(option.id)}
                onChange={(e) => toggle(option.id, e.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {(poll.kind === 'text' || poll.otherText) && (
        <label className="form-field">
          <span className="form-field__label">
            {poll.kind === 'text' ? 'Your answer' : 'Other answer'}
          </span>
          <textarea
            className="search-input"
            rows={poll.kind === 'text' ? 3 : 2}
            maxLength={TEXT_MAX}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!poll.multiple && e.target.value) setChosen([]);
            }}
            // On a phone the keyboard must not hide the field or "Vote" (aboveKeyboard.js).
            onFocus={(e) => {
              stopFollowing.current = keepAboveKeyboard(e.target, submitButton.current);
            }}
            onBlur={() => stopFollowing.current?.()}
          />
        </label>
      )}
      <FormMessage error={error} />
      <button ref={submitButton} type="submit" className="button" disabled={busy}>
        {poll.voted ? 'Change vote' : 'Vote'}
      </button>
    </form>
  );
}
