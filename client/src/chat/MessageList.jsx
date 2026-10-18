// ============================================================
// File:        MessageList.jsx
// Path:        client/src/chat/MessageList.jsx
// Project:     Seasonal Entertainment
// Description: The scrolling list of a room's messages inside a chat panel, pinned to the
//              newest message while the reader is at the bottom (useScrollPin), with a
//              "New messages" button when they have scrolled up and something new arrives.
// ============================================================

import { useRef } from 'react';
import ChatMessage from './ChatMessage.jsx';
import { useScrollPin } from './useScrollPin.js';

export default function MessageList({ room, roomName, messages, moderator, onAction }) {
  const list = useRef(null);
  const { onScroll, unseen, showNewest } = useScrollPin(list, room, messages);
  return (
    <div className="chat-messages-frame">
      <ol
        ref={list}
        className="chat-messages"
        aria-label={`Messages in ${roomName}`}
        onScroll={onScroll}
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} moderator={moderator} onAction={onAction} />
        ))}
      </ol>
      {unseen && (
        <button type="button" className="chat-new-messages" onClick={showNewest}>
          New messages
        </button>
      )}
    </div>
  );
}
