// ============================================================
// File:        MessageList.jsx
// Path:        client/src/chat/MessageList.jsx
// Project:     Seasonal Entertainment
// Description: The scrolling list of a room's messages inside a chat panel.
// ============================================================

import ChatMessage from './ChatMessage.jsx';

export default function MessageList({ roomName, messages, moderator, onAction }) {
  return (
    <ol className="chat-messages" aria-label={`Messages in ${roomName}`}>
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} moderator={moderator} onAction={onAction} />
      ))}
    </ol>
  );
}
