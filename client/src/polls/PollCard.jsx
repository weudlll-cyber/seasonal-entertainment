// ============================================================
// File:        PollCard.jsx
// Path:        client/src/polls/PollCard.jsx
// Project:     Seasonal Entertainment
// Description: One poll (the Polls page; docs/POLLS.md): its question, when it ends or ended,
//              the number of votes and whether it is anonymous; the vote form while the viewer
//              may vote (PollVote), the rule of when its results show ("Results after you
//              vote" / "after the poll ends"; organisers and admins: live), "You voted" with
//              the way to change it where the poll allows, the results when the server shows
//              them (PollResults),
//              otherwise why not ("Results after the end", "Sign in to vote", "Voting from
//              <steps>" for a member without the step); a team poll says so; a call's poll
//              counts down (Countdown) and, on the Polls page, links its call. Organisers and
//              admins end it early, extend it, and switch anonymous before the first vote;
//              admins delete it after a question. Every change reloads the lists
//              (pollsChanged).
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormField, FormMessage } from '../components/FormField.jsx';
import Countdown from './Countdown.jsx';
import PollResults from './PollResults.jsx';
import PollVote from './PollVote.jsx';
import { pollsChanged } from './usePolls.js';

// A call's poll counts down (it lasts minutes); others name their end.
function endLine(poll) {
  if (!poll.open) return `Ended ${formatWhen(poll.endedAt ?? poll.endsAt)}`;
  if (poll.endsAt && poll.callId) return <Countdown endsAt={poll.endsAt} />;
  return poll.endsAt ? `Ends ${formatWhen(poll.endsAt)}` : 'Ends by hand';
}

// When the results show (decided 2026-11-11: every voter sees the rule); organisers and admins
// see them live whatever it says.
function resultsRule(poll, canManage) {
  const rule = poll.resultsWhen === 'after_end' ? 'after the poll ends' : 'after you vote';
  return canManage
    ? `You see live results. Members: results ${rule === 'after you vote' ? 'after their vote' : rule}.`
    : `Results ${rule}.`;
}

// signedIn: whether someone is signed in (guests get a sign-in hint); canManage, canDelete:
// the list's answer; showCall: name the call or chat room a poll was started in (the Polls
// page).
export default function PollCard({ poll, signedIn, canManage, canDelete, showCall = false }) {
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
        {poll.voters === 'team' && ' · Organisers and admins only'}
        {poll.createdBy && ` · by ${poll.createdBy}`}
        {showCall && poll.roomSlug && (
          <>
            {' · in the room '}
            <Link to={`/chat?room=${encodeURIComponent(poll.roomSlug)}`}>{poll.roomName}</Link>
          </>
        )}
        {showCall && poll.callId && (
          <>
            {' · in the call '}
            <Link to={`/calls/${poll.callId}`}>{poll.callTitle}</Link>
          </>
        )}
      </p>
      {poll.open && <p className="poll-card__rule">{resultsRule(poll, canManage)}</p>}
      {poll.canVote && poll.voted && (
        <p>
          You voted. You can change your vote until the poll ends
          {poll.anonymous && ' (it is anonymous: your earlier answers are not shown)'}.
        </p>
      )}
      {poll.canVote && <PollVote poll={poll} onVoted={pollsChanged} />}
      {poll.open && signedIn && !poll.mayVote && poll.steps.length > 0 && (
        <p>Voting from {poll.steps.join(' or ')}.</p>
      )}
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
