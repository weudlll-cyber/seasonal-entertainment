// ============================================================
// File:        UnreadCount.jsx
// Path:        client/src/chat/UnreadCount.jsx
// Project:     Seasonal Entertainment
// Description: One unread counter as a small round badge: blue (winter) for room messages,
//              orange (summer) for private messages, dark text on both (WCAG AA). Nothing at
//              0; "99+" above 99. An "@" in front marks an unread mention of the member (shown
//              even when the count itself is not, e.g. for a muted room). `label` is what a
//              screen reader hears for it.
// ============================================================

import { badgeText } from './unread.js';
import './ChatUnread.css';

// kind: 'room' | 'direct'; dim: a muted room's count; mention: an unread mention is among them.
export default function UnreadCount({ count, kind, label, dim = false, mention = false }) {
  if (!count && !mention) return null;
  return (
    <span
      className={`chat-count chat-count--${kind}${dim && !mention ? ' chat-count--dim' : ''}`}
      role="img"
      aria-label={label}
    >
      {mention && '@'}
      {count > 0 && badgeText(count)}
    </span>
  );
}
