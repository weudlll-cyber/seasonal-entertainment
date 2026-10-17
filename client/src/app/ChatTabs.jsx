// ============================================================
// File:        ChatTabs.jsx
// Path:        client/src/app/ChatTabs.jsx
// Project:     Seasonal Entertainment
// Description: "Rooms" and "Direct" above the chat (drawer and full chat page; members only:
//              guests have no direct messages). Tabs in the ARIA sense: arrow keys move
//              between them, the chosen one controls the panel below.
// ============================================================

import './ChatTabs.css';

const TABS = [
  ['rooms', 'Rooms'],
  ['direct', 'Direct'],
];

// value: 'rooms' or 'direct'; onChange(value); idPrefix: keeps ids unique per host.
export default function ChatTabs({ value, onChange, idPrefix }) {
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
        </button>
      ))}
    </div>
  );
}
