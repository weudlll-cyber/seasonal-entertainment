// ============================================================
// File:        ChatTabs.jsx
// Path:        client/src/app/ChatTabs.jsx
// Project:     Seasonal Entertainment
// Description: "Rooms" and "Direct" above the chat (drawer and full chat page; members only:
//              guests have no direct messages). Tabs in the ARIA sense: arrow keys move
//              between them, the chosen one controls the panel below. Each tab carries its
//              unread total (blue for rooms, orange for private messages).
// ============================================================

import { UnreadCount } from '../chat/index.js';
import './ChatTabs.css';

const TABS = [
  ['rooms', 'Rooms'],
  ['direct', 'Direct'],
];

const KINDS = { rooms: 'room', direct: 'direct' };

// value: 'rooms' or 'direct'; onChange(value); idPrefix: keeps ids unique per host;
// counts: { rooms, direct } unread totals.
export default function ChatTabs({ value, onChange, idPrefix, counts }) {
  function onKeyDown(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = value === 'rooms' ? 'direct' : 'rooms';
    onChange(next);
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
  }
  return (
    <div role="tablist" aria-label="Chat" className="chat-tabs" onKeyDown={onKeyDown}>
      {TABS.map(([key, label]) => (
        <button
          key={key}
          id={`${idPrefix}-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === key ? 0 : -1}
          className="chat-tabs__tab"
          onClick={() => onChange(key)}
        >
          {label}
          <UnreadCount count={counts[key]} kind={KINDS[key]} label={`${counts[key]} unread`} />
        </button>
      ))}
    </div>
  );
}
