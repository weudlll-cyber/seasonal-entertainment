// ============================================================
// File:        ChatPollCard.jsx
// Path:        client/src/polls/ChatPollCard.jsx
// Project:     Seasonal Entertainment
// Description: A poll's card in a chat room's timeline (chat/ChatMessage.jsx, a message with a
//              pollId; docs/POLLS.md, "Polls in chat rooms"): the same card as on the Polls page
//              (PollCard: vote, results, the organisers' actions), loaded by its id (usePoll)
//              and kept live the same ways. Whoever sees the room's messages may read the room,
//              and so the poll; a poll deleted since shows that it is gone.
// ============================================================

import PollCard from './PollCard.jsx';
import { usePoll } from './usePolls.js';
import { useSession } from '../session/SessionContext.jsx';
import './polls.css';

export default function ChatPollCard({ pollId }) {
  const { user } = useSession();
  const { answer, error } = usePoll(pollId);
  if (error) return <p className="chat-poll chat-note">This poll was deleted.</p>;
  if (!answer) return null;
  return (
    <ul className="poll-list chat-poll" aria-label="Poll">
      <PollCard
        poll={answer.poll}
        signedIn={Boolean(user)}
        canManage={answer.canManage}
        canDelete={answer.canDelete}
      />
    </ul>
  );
}
