// ============================================================
// File:        ChatPage.jsx
// Path:        client/src/pages/ChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /chat: the full chat filling the main column, rooms on its left; only the
//              message list scrolls and the composer stays at the bottom. Members also get the
//              Direct section (private messages, end to end encrypted) as a second tab; "Send
//              private message" in a name menu switches to it. Everything chat lives in the
//              chat module (client/src/chat, docs/CHAT.md). SE style: the Chat header with the
//              circle-of-people quarter.
// ============================================================

import { useEffect, useState } from 'react';
import ChatTabs from '../app/ChatTabs.jsx';
import DirectTab from '../app/DirectTab.jsx';
import PageHeader from '../brand/PageHeader.jsx';
import { ChatPanel, onDirectRequest, useUnread } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';

export default function ChatPage() {
  const { user } = useSession();
  const unread = useUnread();
  const [tab, setTab] = useState('rooms');
  useEffect(() => onDirectRequest(() => setTab('direct')), []);
  // Guests have no direct messages: for them there are only rooms.
  const shown = user ? tab : 'rooms';
  return (
    <section className="chat-page">
      <PageHeader
        quarter="chat"
        title="Chat"
        lead="Talk with the community: rooms and private messages."
      />
      {user && (
        <ChatTabs
          value={shown}
          onChange={setTab}
          idPrefix="chat-page"
          counts={{ rooms: unread.roomTotal, direct: unread.directTotal }}
        />
      )}
      <div
        id="chat-page-panel"
        className="chat-page__panel"
        {...(user && { role: 'tabpanel', 'aria-labelledby': `chat-page-tab-${shown}` })}
      >
        {shown === 'rooms' ? (
          <ChatPanel room="general" variant="full" showRoomTabs />
        ) : (
          <DirectTab variant="full" />
        )}
      </div>
    </section>
  );
}
