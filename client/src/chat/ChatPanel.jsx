// ============================================================
// File:        ChatPanel.jsx
// Path:        client/src/chat/ChatPanel.jsx
// Project:     Seasonal Entertainment
// Description: The chat module's one public component (docs/CHAT.md): a room's live messages,
//              per-message actions and the composer, for whoever is signed in (or a guest).
//              Self-contained: data, the shared live connection and styles live in this
//              folder; it needs only its props and the site's account context.
// ============================================================

import { useSession } from '../session/SessionContext.jsx';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import MessageList from './MessageList.jsx';
import { useChatRoom } from './useChatRoom.js';
import './ChatPanel.css';
import './ChatPicker.css';

// room: slug of the room shown first. variant: 'full' (a page of its own) or 'compact' (a
// box beside other content). showRoomTabs: let the reader switch between their rooms.
export default function ChatPanel({ room: initialRoom, variant = 'full', showRoomTabs = false }) {
  const { user } = useSession();
  const chat = useChatRoom(initialRoom, user);
  const { info, room, current } = chat;
  const roomName = current?.name ?? room;

  return (
    <section className={`se-chat se-chat--${variant}`} aria-label={`Chat: ${roomName}`}>
      {showRoomTabs ? (
        <nav aria-label="Rooms">
          <ul className="chat-rooms">
            {info?.rooms.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  className={`chat-room${r.slug === room ? ' chat-room--current' : ''}`}
                  aria-current={r.slug === room ? 'page' : undefined}
                  onClick={() => chat.setRoom(r.slug)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p className="chat-panel__title">{roomName}</p>
      )}
      <MessageList
        roomName={roomName}
        messages={chat.messages}
        moderator={info?.me.moderator}
        onAction={chat.act}
      />
      <ChatNotice error={chat.error} notice={chat.notice} />
      {current?.canWrite ? (
        <ChatComposer user={user} guestName={info.me.guestName} onSend={chat.send} />
      ) : (
        current && <p className="chat-note">You can read this room, but not write in it.</p>
      )}
    </section>
  );
}
