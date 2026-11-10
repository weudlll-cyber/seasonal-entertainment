// ============================================================
// File:        PollsPage.jsx
// Path:        client/src/pages/PollsPage.jsx
// Project:     Seasonal Entertainment
// Description: /polls (docs/POLLS.md; decided 2026-11-10): every poll for everyone, open ones
//              first, then the ended ones with their results (the archive). Members vote right
//              here; guests see a sign-in hint. Organisers and admins create polls here (the
//              form opens on "New poll"). The list stays current by itself (polls/usePolls.js).
//              Under the Community quarter, as the chat.
// ============================================================

import { useState } from 'react';
import PageHeader from '../brand/PageHeader.jsx';
import { FormMessage } from '../components/FormField.jsx';
import PollCard from '../polls/PollCard.jsx';
import PollForm from '../polls/PollForm.jsx';
import { pollsChanged, usePolls } from '../polls/usePolls.js';
import '../polls/polls.css';
import { useSession } from '../session/SessionContext.jsx';

const LEAD = 'Have your say: open polls first, then the results of the ended ones.';

export default function PollsPage() {
  const { user } = useSession();
  const { answer, error } = usePolls();
  const [creating, setCreating] = useState(false);
  const polls = answer?.polls ?? [];
  const open = polls.filter((p) => p.open);
  const ended = polls.filter((p) => !p.open);
  const card = (poll) => (
    <PollCard
      key={poll.id}
      poll={poll}
      signedIn={Boolean(user)}
      canManage={answer.canManage}
      canDelete={answer.canDelete}
      showCall
    />
  );

  return (
    <section className="page page--wide">
      <PageHeader quarter="chat" title="Polls" lead={LEAD} />
      <FormMessage error={error} />
      {answer?.canManage &&
        (creating ? (
          <PollForm
            steps={answer.steps}
            onCreated={() => {
              setCreating(false);
              pollsChanged();
            }}
          />
        ) : (
          <p>
            <button type="button" className="button" onClick={() => setCreating(true)}>
              New poll
            </button>
          </p>
        ))}
      {answer && (
        <>
          <h2>Open polls</h2>
          {open.length === 0 ? (
            <p>No open poll at the moment.</p>
          ) : (
            <ul className="poll-list" aria-label="Open polls">
              {open.map(card)}
            </ul>
          )}
          {ended.length > 0 && (
            <>
              <h2>Ended polls</h2>
              <ul className="poll-list" aria-label="Ended polls">
                {ended.map(card)}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
