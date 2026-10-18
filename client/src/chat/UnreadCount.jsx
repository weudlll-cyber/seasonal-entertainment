// ============================================================
// File:        UnreadCount.jsx
// Path:        client/src/chat/UnreadCount.jsx
// Project:     Seasonal Entertainment
// Description: One unread counter as a small round badge: blue (winter) for room messages,
//              orange (summer) for private messages, dark text on both (WCAG AA). Nothing at
//              0; "99+" above 99. `label` is what a screen reader hears for it.
// ============================================================

import { badgeText } from './unread.js';
import './ChatUnread.css';

// kind: 'room' | 'direct'; dim: a muted room's count.
export default function UnreadCount({ count, kind, label, dim = false }) {
  if (!count) return null;
  return (
    <span
      className={`chat-count chat-count--${kind}${dim ? ' chat-count--dim' : ''}`}
      role="img"
      aria-label={label}
    >
      {badgeText(count)}
    </span>
  );
}
