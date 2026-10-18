// ============================================================
// File:        UnreadDots.jsx
// Path:        client/src/app/UnreadDots.jsx
// Project:     Seasonal Entertainment
// Description: The chat's two unread counters side by side, on the floating chat button and the
//              sidebar's "Chat" item: blue for room messages (muted rooms left out), orange for
//              private messages; each hidden at 0, "99+" above 99. The badges themselves are
//              hidden from screen readers; unreadSummary() gives the words for the accessible
//              name of whatever carries them.
// ============================================================

import { UnreadCount, useUnread } from '../chat/index.js';

// ": 2 unread room messages, 3 unread private messages", or "" when there is nothing unread.
export function unreadSummary({ roomTotal, directTotal }) {
  const parts = [];
  if (roomTotal) parts.push(`${roomTotal} unread room message${roomTotal === 1 ? '' : 's'}`);
  if (directTotal) {
    parts.push(`${directTotal} unread private message${directTotal === 1 ? '' : 's'}`);
  }
  return parts.length ? `: ${parts.join(', ')}` : '';
}

export default function UnreadDots() {
  const counts = useUnread();
  if (!counts.roomTotal && !counts.directTotal) return null;
  return (
    <span className="unread-dots" aria-hidden="true">
      <UnreadCount count={counts.roomTotal} kind="room" />
      <UnreadCount count={counts.directTotal} kind="direct" />
    </span>
  );
}
