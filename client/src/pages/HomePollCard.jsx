// ============================================================
// File:        HomePollCard.jsx
// Path:        client/src/pages/HomePollCard.jsx
// Project:     Seasonal Entertainment
// Description: The home page's "Poll" box (docs/DESIGN.md, "Home"; docs/POLLS.md, decided
//              2026-11-10): the newest open poll the viewer sees (GET /api/polls/summary,
//              usePollSummary), beside "Up next" in the top row (which then takes one column,
//              homePoll.css). Its question, clamped at 2 lines (the full question as the
//              box's name and tooltip). A single-choice poll without a written answer is voted
//              right here: a dropdown of its answers and "Vote" on one line (a poll that is not
//              anonymous says so first). A poll with several answers or a text links to the
//              Polls page ("Vote"): its form would not fit the top row (docs/DESIGN.md: home
//              fits the window without scrolling). Afterwards
//              "You voted" and the number of votes; guests a sign-in hint. No poll: no box.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { QUARTERS } from '../brand/brand.js';
import { pollsChanged, usePollSummary } from '../polls/usePolls.js';
import { useSession } from '../session/SessionContext.jsx';
import { Wash } from './homeCards.jsx';
import './homePoll.css';

// Voted right in the box: one answer among the fixed ones, nothing written (a dropdown and
// "Vote" on one line; several answers or a text would not fit the top row).
const votesHere = (poll) => poll.kind === 'choice' && !poll.multiple && !poll.otherText;

export default function HomePollCard() {
  const { user } = useSession();
  const poll = usePollSummary().answer?.newest;
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState(null);
  if (!poll) return null;

  async function vote(event) {
    event.preventDefault();
    if (!chosen) return setError('Please choose an answer.');
    try {
      await api(`/polls/${poll.id}/vote`, {
        method: 'POST',
        body: { options: [Number(chosen)], text: '' },
      });
      setChosen('');
      setError(null);
      pollsChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const votes = `${poll.votes} ${poll.votes === 1 ? 'vote' : 'votes'}`;
  return (
    <section className="card home__card home__poll" aria-label={`Poll: ${poll.question}`}>
      <Wash src={QUARTERS.chat} />
      <div className="home__card-head">
        <p className="home__eyebrow">Poll</p>
        <Link to="/polls">All polls</Link>
      </div>
      <h2 className="home__poll-question" title={poll.question}>
        {poll.question}
      </h2>
      {poll.canVote && votesHere(poll) && (
        <form className="home__poll-vote" onSubmit={vote}>
          {!poll.anonymous && <p className="home__poll-note">Not anonymous: your name is shown.</p>}
          <div className="home__poll-row">
            <select
              aria-label="Your answer"
              className="search-input"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">Choose…</option>
              {poll.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className="button">
              Vote
            </button>
          </div>
        </form>
      )}
      {poll.canVote && !votesHere(poll) && (
        <p className="home__actions">
          <Link className="button" to="/polls">
            Vote
          </Link>
        </p>
      )}
      {poll.voted && !poll.canVote && <p>You voted · {votes}</p>}
      {!user && (
        <p>
          <Link to="/login">Sign in</Link> to vote · {votes}
        </p>
      )}
      {user && !poll.mayVote && <p>{votes}</p>}
      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
