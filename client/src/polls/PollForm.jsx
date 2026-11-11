// ============================================================
// File:        PollForm.jsx
// Path:        client/src/polls/PollForm.jsx
// Project:     Seasonal Entertainment
// Description: Creating a poll (organisers and admins, the Polls page; docs/POLLS.md): the
//              question; fixed answers (2 to 10, one or several may be chosen, optionally an
//              "Other answer" text) or free text only; when the results show; anonymous or
//              not; who may vote (all members, Discord steps grouped by ladder, or organisers
//              and admins only); a fixed end or "end by hand" (in a live call instead 1, 2 or
//              5 minutes or by hand, callId; in a chat room: room). With free text on, a warning says those
//              answers are evaluated by hand. Checked like the server (shared/pollRules.js
//              validatePoll) before it is sent; onCreated() after the server stored it.
// ============================================================

import { useState } from 'react';
import {
  OPTION_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_MAX,
  hasFreeText,
  validatePoll,
} from '@seasonal-entertainment/shared/pollRules.js';
import { LADDER_NAMES, LADDERS } from '@seasonal-entertainment/shared/discordLadders.js';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

const EMPTY = {
  question: '',
  kind: 'choice',
  options: ['', ''],
  multiple: false,
  otherText: false,
  results: 'after_vote',
  anonymous: false,
  voters: 'members',
  steps: [],
  ending: 'hand',
  endsAt: '',
};

// A radio button with its text (the site's form-check).
function Choice({ name, value, current, onPick, children }) {
  return (
    <label className="form-check">
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} />
      <span>{children}</span>
    </label>
  );
}

// A call's poll lasts minutes: these, or by hand.
const CALL_MINUTES = [1, 2, 5];

// The end chosen: a fixed time, minutes from now (a call's poll), or none (by hand).
function endOf(poll) {
  if (poll.ending === 'time') return poll.endsAt ? new Date(poll.endsAt).toISOString() : null;
  const minutes = Number(poll.ending);
  return minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
}

// steps: the Discord steps a poll can be limited to ({ id, ladder, name }, GET /api/polls);
// callId: started in this live call (its page), with an end in minutes; room: started in this
// chat room (its slug; chat/ChatPanel.jsx), its card then in the timeline.
export default function PollForm({ steps = [], callId = null, room = null, onCreated }) {
  const [poll, setPoll] = useState(callId === null ? EMPTY : { ...EMPTY, ending: '1' });
  const [error, setError] = useState(null);
  const set = (key) => (value) => setPoll((now) => ({ ...now, [key]: value }));
  const setOption = (i, value) =>
    setPoll((now) => ({ ...now, options: now.options.map((o, j) => (j === i ? value : o)) }));

  async function submit(event) {
    event.preventDefault();
    const input = {
      question: poll.question,
      kind: poll.kind,
      options: poll.kind === 'choice' ? poll.options : [],
      multiple: poll.multiple,
      otherText: poll.otherText,
      results: poll.results,
      anonymous: poll.anonymous,
      voters: poll.voters,
      steps: poll.voters === 'steps' ? poll.steps : [],
      // datetime-local has no time zone: the browser's own, turned into UTC here.
      endsAt: endOf(poll),
      ...(callId === null ? {} : { callId }),
      ...(room === null ? {} : { room }),
    };
    const problem =
      poll.ending === 'time' && !poll.endsAt
        ? 'Please choose when the poll ends.'
        : validatePoll(input);
    if (problem) return setError(problem);
    try {
      await api('/polls', { method: 'POST', body: input });
      setPoll(EMPTY);
      setError(null);
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form poll-form" onSubmit={submit} aria-label="New poll">
      <FormField
        label="Question"
        type="text"
        value={poll.question}
        maxLength={QUESTION_MAX}
        onChange={(e) => set('question')(e.target.value)}
      />
      <fieldset aria-label="How people answer">
        <Choice name="kind" value="choice" current={poll.kind} onPick={set('kind')}>
          Fixed answers
        </Choice>
        <Choice name="kind" value="text" current={poll.kind} onPick={set('kind')}>
          Free text only
        </Choice>
      </fieldset>
      {poll.kind === 'choice' && (
        <fieldset aria-label="Answers" className="poll-form__options">
          {poll.options.map((option, i) => (
            <div key={i} className="poll-form__option">
              <FormField
                label={`Answer ${i + 1}`}
                type="text"
                value={option}
                maxLength={OPTION_MAX}
                onChange={(e) => setOption(i, e.target.value)}
              />
              {poll.options.length > OPTIONS_MIN && (
                <button
                  type="button"
                  className="button button--secondary"
                  aria-label={`Remove answer ${i + 1}`}
                  onClick={() => set('options')(poll.options.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {poll.options.length < OPTIONS_MAX && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => set('options')([...poll.options, ''])}
            >
              Add an answer
            </button>
          )}
          <label className="form-check">
            <input
              type="checkbox"
              checked={poll.multiple}
              onChange={(e) => set('multiple')(e.target.checked)}
            />
            <span>Several answers may be chosen</span>
          </label>
          <label className="form-check">
            <input
              type="checkbox"
              checked={poll.otherText}
              onChange={(e) => set('otherText')(e.target.checked)}
            />
            <span>Also an "Other answer" text field</span>
          </label>
        </fieldset>
      )}
      {hasFreeText(poll) && (
        <p className="form-message form-message--notice" role="note">
          Written answers must be evaluated by hand. Only organisers and admins read them; everyone
          else sees how many there are.
        </p>
      )}
      <fieldset aria-label="Results show">
        <Choice name="results" value="after_vote" current={poll.results} onPick={set('results')}>
          Results right after your vote
        </Choice>
        <Choice name="results" value="after_end" current={poll.results} onPick={set('results')}>
          Results after the poll ends (votes can be changed until then)
        </Choice>
      </fieldset>
      <label className="form-check">
        <input
          type="checkbox"
          checked={poll.anonymous}
          onChange={(e) => set('anonymous')(e.target.checked)}
        />
        <span>Anonymous: nobody, admins included, sees who voted what (a vote is then final)</span>
      </label>
      <fieldset aria-label="Who may vote">
        <Choice name="voters" value="members" current={poll.voters} onPick={set('voters')}>
          All members
        </Choice>
        {steps.length > 0 && (
          <Choice name="voters" value="steps" current={poll.voters} onPick={set('voters')}>
            Members with a Discord step (that step or a higher one)
          </Choice>
        )}
        <Choice name="voters" value="team" current={poll.voters} onPick={set('voters')}>
          Organisers and admins only (only they see the poll)
        </Choice>
      </fieldset>
      {poll.voters === 'steps' && (
        <fieldset aria-label="Discord steps" className="poll-form__steps">
          {LADDERS.map((ladder) => (
            <div key={ladder} role="group" aria-label={LADDER_NAMES[ladder]}>
              {steps
                .filter((s) => s.ladder === ladder)
                .map((step) => (
                  <label key={step.id} className="form-check">
                    <input
                      type="checkbox"
                      checked={poll.steps.includes(step.id)}
                      onChange={(e) =>
                        set('steps')(
                          e.target.checked
                            ? [...poll.steps, step.id]
                            : poll.steps.filter((id) => id !== step.id)
                        )
                      }
                    />
                    <span>{step.name}</span>
                  </label>
                ))}
            </div>
          ))}
        </fieldset>
      )}
      <fieldset aria-label="End">
        {callId !== null &&
          CALL_MINUTES.map((minutes) => (
            <Choice
              key={minutes}
              name="ending"
              value={String(minutes)}
              current={poll.ending}
              onPick={set('ending')}
            >
              {minutes === 1 ? '1 minute' : `${minutes} minutes`}
            </Choice>
          ))}
        <Choice name="ending" value="hand" current={poll.ending} onPick={set('ending')}>
          End by hand
        </Choice>
        {callId === null && (
          <Choice name="ending" value="time" current={poll.ending} onPick={set('ending')}>
            End at a fixed time
          </Choice>
        )}
      </fieldset>
      {poll.ending === 'time' && (
        <FormField
          label="Ends at"
          type="datetime-local"
          value={poll.endsAt}
          onChange={(e) => set('endsAt')(e.target.value)}
        />
      )}
      <FormMessage error={error} />
      <button type="submit" className="button">
        Create poll
      </button>
    </form>
  );
}
