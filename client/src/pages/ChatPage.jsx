// ============================================================
// File:        ChatPage.jsx
// Path:        client/src/pages/ChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /chat: the full chat filling the main column, rooms on its left; only the
//              message list scrolls and the composer stays at the bottom. Members also get the
//              Direct section (private messages, end to end encrypted) as a second tab; "Send
//              private message" in a name menu switches to it. A link may open a room
//              (?room=<slug>) or a conversation (?direct=<member id>&name=<username>), as a
//              notification's click does (notify/). Members get the chat menu
//              (NotificationsMenu). Everything chat lives in the chat module (client/src/chat,
//              docs/CHAT.md). SE style: the Chat header with the circle-of-people quarter.
// ============================================================

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import ChatTabs from '../app/ChatTabs.jsx';
import DirectTab from '../app/DirectTab.jsx';
import PageHeader from '../brand/PageHeader.jsx';
import { ChatPanel, onDirectRequest, requestDirect, useUnread } from '../chat/index.js';
import NotificationsMenu from '../notify/NotificationsMenu.jsx';
import { useSession } from '../session/SessionContext.jsx';

export default function ChatPage() {
  const { user } = useSession();
  const unread = useUnread();
  const [tab, setTab] = useState('rooms');
  useEffect(() => onDirectRequest(() => setTab('direct')), []);
  const [params] = useSearchParams();
  const room = params.get('room') || 'general';
  const direct = Number(params.get('direct'));
  const directName = params.get('name');
  // After the listener above: the request switches this page to its Direct tab.
  useEffect(() => {
    if (direct > 0) requestDirect({ id: direct, username: directName ?? '' });
  }, [direct, directName]);
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
        <div className="chat-page__bar">
          <NotificationsMenu />
        </div>
      )}
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
          <ChatPanel room={room} variant="full" showRoomTabs />
        ) : (
          <DirectTab variant="full" />
        )}
      </div>
    </section>
  );
}
