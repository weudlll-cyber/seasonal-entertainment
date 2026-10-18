// ============================================================
// File:        CallChat.jsx
// Path:        client/src/calls/CallChat.jsx
// Project:     Seasonal Entertainment
// Description: The call's chat beside the stage: the chat module's compact ChatPanel with the
//              call's unlisted room, and a collapse button. Collapsed, it is a slim vertical
//              tab with how many messages arrived meanwhile (useNewMessageCount); this browser
//              remembers the choice (app/storage.js, never throws). Below 1000px the chat is a
//              drawer instead, opened from the page header (callPage.css).
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import { readStored, writeStored } from '../app/storage.js';
import { ChatPanel, useNewMessageCount } from '../chat/index.js';

export const COLLAPSED_KEY = 'se.callChat.collapsed';

// room: the chat room's slug; status: the call's status (a new one reloads the chat: it is
// read-only once the call ended); onCollapse(collapsed): tells the page, which narrows its
// chat column.
export default function CallChat({ room, status, collapsed, onCollapse }) {
  const news = useNewMessageCount(room, collapsed);
  if (collapsed) {
    const label = news > 0 ? `Show the call chat, ${news} new` : 'Show the call chat';
    return (
      <aside id="call-chat" className="call-page__chat call-chat--collapsed" aria-label="Call chat">
        <button
          type="button"
          className="call-chat__tab"
          aria-label={label}
          aria-expanded="false"
          onClick={() => onCollapse(false)}
        >
          <Icon name="chat" size={20} />
          <span className="call-chat__tab-text" aria-hidden="true">
            Chat
          </span>
          {news > 0 && (
            <span className="chat-count chat-count--room" aria-hidden="true">
              {news > 99 ? '99+' : news}
            </span>
          )}
        </button>
      </aside>
    );
  }
  return (
    <aside id="call-chat" className="call-page__chat" aria-label="Call chat">
      <button
        type="button"
        className="call-chat__collapse"
        aria-label="Collapse the call chat"
        aria-expanded="true"
        data-tooltip="Collapse the chat"
        onClick={() => onCollapse(true)}
      >
        <Icon name="chevron" size={18} />
      </button>
      <ChatPanel key={status} room={room} variant="compact" unlisted />
    </aside>
  );
}

// The remembered choice, as a hook for the page.
export function useChatCollapsed() {
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1');
  const change = (next) => {
    setCollapsed(next);
    writeStored(COLLAPSED_KEY, next ? '1' : null);
  };
  return [collapsed, change];
}
