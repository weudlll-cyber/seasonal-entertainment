// ============================================================
// File:        LowMessageList.jsx
// Path:        client/src/chat/LowMessageList.jsx
// Project:     Seasonal Entertainment
// Description: The messages of a low chat panel (ChatPanel with low; the 100 px strip of a game):
//              the newest three, one line each — author, Guest or staff badge, text, cut with an
//              ellipsis and whole in the tooltip; an attachment or poll without text is named.
//              ChatLow.css shows two or three of them, by the room there is. Plain text only: no
//              links, name menus or "…" menu, which have no room here. Showing the newest moves
//              the read marker, as MessageList does.
// ============================================================

import { useEffect } from 'react';
import { useSession } from '../session/SessionContext.jsx';
import { STAFF_BADGES } from './staffBadges.js';
import './ChatLow.css';

const SHOWN = 3;
const KINDS = { sticker: 'Sticker', gif: 'GIF' };

// What stands for a message without text.
function stands(message) {
  if (message.pollId) return 'Poll';
  if (message.file) return message.file.removed ? 'File removed' : `File: ${message.file.name}`;
  return KINDS[message.kind] ?? '';
}

function LowMessage({ message, mentionsMe }) {
  const staff = STAFF_BADGES[message.authorRole];
  const text = message.body || stands(message);
  return (
    <li
      className={`chat-low-message${message.hiddenAt ? ' chat-message--hidden' : ''}${mentionsMe ? ' chat-message--mention' : ''}`}
      title={`${message.author}: ${text}`}
    >
      <span
        className={`chat-low-message__author${staff ? ` chat-message__meta--${message.authorRole}` : ''}`}
      >
        <strong>{message.author}</strong>
      </span>
      {staff && <span className={`chat-badge chat-badge--${message.authorRole}`}>{staff}</span>}
      {message.isGuest && <span className="chat-badge">Guest</span>}
      {message.isSystem && <span className="chat-badge">Site</span>}
      <span className="chat-low-message__text">{text}</span>
    </li>
  );
}

export default function LowMessageList({ roomName, messages, onSeen }) {
  const { user } = useSession();
  const newestId = messages.at(-1)?.id;
  useEffect(() => {
    if (newestId) onSeen(newestId);
  }, [newestId, onSeen]);
  return (
    <ol className="chat-low-messages" aria-label={`Messages in ${roomName}`}>
      {messages.slice(-SHOWN).map((m) => (
        <LowMessage
          key={m.id}
          message={m}
          mentionsMe={Boolean(user) && (m.mentions ?? []).some((who) => who.id === user.id)}
        />
      ))}
    </ol>
  );
}
