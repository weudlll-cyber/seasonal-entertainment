// ============================================================
// File:        CallPolls.jsx
// Path:        client/src/calls/CallPolls.jsx
// Project:     Seasonal Entertainment
// Description: The polls of one call on its page, under the stage (docs/POLLS.md, "Polls in a
//              call"; decided 2026-11-10): everyone on the page sees them, open ones with
//              their countdown first, then the ended ones with their results; members vote
//              right here (PollCard). Organisers and admins start one while the call is live
//              (the header's "Start a poll" opens the create form here, with 1, 2 or 5
//              minutes or by hand). Asked every 10 seconds and at once on the live "polls"
//              event (usePolls). Nothing shows while the call has no poll and no form is open,
//              so the stage keeps its height.
// ============================================================

import PollCard from '../polls/PollCard.jsx';
import PollForm from '../polls/PollForm.jsx';
import { pollsChanged, usePolls } from '../polls/usePolls.js';
import '../polls/polls.css';
import { useSession } from '../session/SessionContext.jsx';

// callId: the call's id (a number); creating: the header's "Start a poll" was chosen (the
// call is live); onDone(): after the poll was created or the form was left.
export default function CallPolls({ callId, creating, onDone }) {
  const { user } = useSession();
  const { answer } = usePolls(callId);
  const polls = answer?.polls ?? [];
  const showForm = creating && Boolean(answer?.canManage);
  if (polls.length === 0 && !showForm) return null;

  return (
    <section className="call-polls" aria-label="Polls in this call">
      {showForm && (
        <>
          <PollForm
            callId={callId}
            steps={answer.steps}
            onCreated={() => {
              onDone();
              pollsChanged();
            }}
          />
          <button type="button" className="button button--secondary" onClick={onDone}>
            Cancel
          </button>
        </>
      )}
      {polls.length > 0 && (
        <ul className="poll-list" aria-label="Polls of this call">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              signedIn={Boolean(user)}
              canManage={answer.canManage}
              canDelete={answer.canDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
