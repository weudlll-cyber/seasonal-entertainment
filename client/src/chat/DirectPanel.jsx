// ============================================================
// File:        DirectPanel.jsx
// Path:        client/src/chat/DirectPanel.jsx
// Project:     Seasonal Entertainment
// Description: The chat module's direct-message view (public, index.js): the member's private
//              conversations — favourite members first (with an online mark), then the most
//              recent, each with its unread count — or one conversation (DirectConversation). The
//              host passes the member's unlocked key (and shows the unlock step while there is
//              none; docs/CHAT.md). Members only.
// ============================================================

import { useSession } from '../session/SessionContext.jsx';
import ChatNotice from './ChatNotice.jsx';
import DirectConversation from './DirectConversation.jsx';
import { showDirect, useDirectPartner } from './directView.js';
import { useDirectConversations } from './useDirect.js';
import { useUnread } from './unread.js';
import UnreadCount from './UnreadCount.jsx';
import './ChatPanel.css';
import './ChatPanelVariants.css';
import './ChatPicker.css';
import './ChatDirect.css';

function ConversationList() {
  const { conversations, error } = useDirectConversations();
  const unread = useUnread();
  if (error) return <ChatNotice error={error} />;
  if (!conversations) return null;
  if (conversations.length === 0) {
    return (
      <p className="chat-note">
        No private conversations yet. Choose &quot;Send private message&quot; on a member&apos;s
        name in a room.
      </p>
    );
  }
  return (
    <ul className="chat-direct-list" aria-label="Private conversations">
      {conversations.map(({ partner, favourite }) => (
        <li key={partner.id}>
          <button
            type="button"
            className="chat-direct-list__item"
            onClick={() => showDirect({ id: partner.id, username: partner.username })}
          >
            {favourite && <span aria-hidden="true">★ </span>}
            <span className="chat-direct-list__name">{partner.username}</span>
            {partner.online && <span className="chat-online">online</span>}
            <UnreadCount
              count={unread.direct(partner.id)}
              kind="direct"
              label={`${unread.direct(partner.id)} unread from ${partner.username}`}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

// keyId, privateKey: the signed-in member's unlocked key (the host's key state, keys/).
export default function DirectPanel({ keyId, privateKey, variant = 'full' }) {
  const { user } = useSession();
  const partner = useDirectPartner();
  return (
    <section className={`se-chat se-chat--${variant}`} aria-label="Private messages">
      {partner ? (
        <DirectConversation partner={partner} me={user} keyId={keyId} privateKey={privateKey} />
      ) : (
        <ConversationList />
      )}
    </section>
  );
}
