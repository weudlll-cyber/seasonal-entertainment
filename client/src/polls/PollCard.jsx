// ============================================================
// File:        PollCard.jsx
// Path:        client/src/polls/PollCard.jsx
// Project:     Seasonal Entertainment
// Description: One poll (the Polls page; docs/POLLS.md): its question, when it ends or ended,
//              the number of votes and whether it is anonymous; the vote form while the viewer
//              may vote (PollVote), the results when the server shows them (PollResults),
//              otherwise why not ("Results after the end", "Sign in to vote"). Organisers and
//              admins end it early, extend it, and switch anonymous before the first vote;
//              admins delete it after a question. Every change reloads the lists
//              (pollsChanged).
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormField, FormMessage } from '../components/FormField.jsx';
import PollResults from './PollResults.jsx';
import PollVote from './PollVote.jsx';
import { pollsChanged } from './usePolls.js';

function endLine(poll) {
  if (!poll.open) return `Ended ${formatWhen(poll.endedAt ?? poll.endsAt)}`;
  return poll.endsAt ? `Ends ${formatWhen(poll.endsAt)}` : 'Ends by hand';
}

// signedIn: whether someone is signed in (guests get a sign-in hint); canManage, canDelete:
// the list's answer.
export default function PollCard({ poll, signedIn, canManage, canDelete }) {
  const [extendTo, setExtendTo] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  async function act(path, options) {
    try {
      await api(`/polls/${poll.id}${path}`, options);
      setError(null);
      pollsChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const votes = `${poll.votes} ${poll.votes === 1 ? 'vote' : 'votes'}`;
  return (
    <li className="poll-card">
      <h2 className="poll-card__question">{poll.question}</h2>
      <p className="poll-card__meta">
        {endLine(poll)} · {votes} · {poll.anonymous ? 'Anonymous' : 'Not anonymous'}
        {poll.createdBy && ` · by ${poll.createdBy}`}
      </p>
      {poll.canVote && <PollVote poll={poll} onVoted={pollsChanged} />}
      {poll.open && !signedIn && (
        <p>
          <Link to="/login">Sign in</Link> to vote.
        </p>
      )}
      {poll.voted && !poll.canVote && poll.open && <p>You voted.</p>}
      {poll.results ? (
        <PollResults poll={poll} />
      ) : (
        poll.open && poll.voted && <p>The results show after the end.</p>
      )}
      {canManage && poll.open && (
        <div className="poll-card__manage" role="group" aria-label="Manage this poll">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => act('/end', { method: 'POST' })}
          >
            End now
          </button>
          <FormField
            label="New end"
            type="datetime-local"
            className="search-input"
            value={extendTo}
            onChange={(e) => setExtendTo(e.target.value)}
          />
          <button
            type="button"
            className="button button--secondary"
            disabled={!extendTo}
            onClick={() =>
              act('/extend', {
                method: 'POST',
                // datetime-local has no time zone: the browser's own, turned into UTC here.
                body: { endsAt: new Date(extendTo).toISOString() },
              })
            }
          >
            Extend
          </button>
          {poll.votes === 0 && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                act('/anonymous', { method: 'POST', body: { anonymous: !poll.anonymous } })
              }
            >
              {poll.anonymous ? 'Make it not anonymous' : 'Make it anonymous'}
            </button>
          )}
        </div>
      )}
      {canDelete && !asking && (
        <button type="button" className="button button--secondary" onClick={() => setAsking(true)}>
          Delete poll
        </button>
      )}
      {canDelete && asking && (
        <p role="group" aria-label="Delete this poll">
          Delete this poll and its votes for good?{' '}
          <button type="button" className="button" onClick={() => act('', { method: 'DELETE' })}>
            Delete
          </button>{' '}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setAsking(false)}
          >
            Keep it
          </button>
        </p>
      )}
      <FormMessage error={error} />
    </li>
  );
}
