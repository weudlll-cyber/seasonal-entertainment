// ============================================================
// File:        ConnectionLimitNotice.jsx
// Path:        client/src/chat/ConnectionLimitNotice.jsx
// Project:     Seasonal Entertainment
// Description: The chat area's line when the server refused this page's live connection as one
//              too many (connection.js; at most 5 per account, docs/CHAT.md): what to do, and
//              "Try again". Nothing otherwise. Shown by the room and direct-message panels.
// ============================================================

import { useEffect, useState } from 'react';
import { connectionRefused, onConnectionRefused, retryConnection } from './connection.js';

export default function ConnectionLimitNotice() {
  const [refused, setRefused] = useState(connectionRefused);
  useEffect(() => onConnectionRefused(setRefused), []);
  if (!refused) return null;
  return (
    <p className="chat-notice chat-notice--error" role="alert">
      You have the chat open in too many windows (at most 5). Close one and try again.{' '}
      <button className="chat-link-button" type="button" onClick={retryConnection}>
        Try again
      </button>
    </p>
  );
}
