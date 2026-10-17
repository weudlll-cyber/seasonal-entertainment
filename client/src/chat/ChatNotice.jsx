// ============================================================
// File:        ChatNotice.jsx
// Path:        client/src/chat/ChatNotice.jsx
// Project:     Seasonal Entertainment
// Description: The chat module's own error / confirmation line (role alert / status, so
//              screen readers announce it), styled by the module wherever it is placed.
// ============================================================

export default function ChatNotice({ error, notice }) {
  if (error) {
    return (
      <p className="chat-notice chat-notice--error" role="alert">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="chat-notice chat-notice--done" role="status">
        {notice}
      </p>
    );
  }
  return null;
}
