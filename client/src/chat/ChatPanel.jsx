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
import RoomTabs from './RoomTabs.jsx';
import { useChatRoom } from './useChatRoom.js';
import './ChatPanel.css';
import './ChatPanelVariants.css';
import './ChatPicker.css';
import './ChatFavourites.css';

// room: slug of the room shown; when it changes the panel follows (a host's room picker).
// variant: 'full' (a page of its own) or 'compact' (a box beside other content).
// showRoomTabs: let the reader switch between their rooms (favourites first, RoomTabs);
// unlisted: the room is not in the room lists (a call's chat), so it is asked for by name.
export default function ChatPanel({
  room: roomInput,
  variant = 'full',
  showRoomTabs = false,
  unlisted = false,
}) {
  const { user } = useSession();
  const chat = useChatRoom(roomInput, user, unlisted);
  const { info, room, current } = chat;
  const roomName = current?.name ?? room;

  return (
    <section
      className={`se-chat se-chat--${variant}${showRoomTabs ? ' se-chat--rooms' : ''}`}
      aria-label={`Chat: ${roomName}`}
    >
      {showRoomTabs ? (
        <RoomTabs rooms={info?.rooms ?? []} current={room} onPick={chat.setRoom} />
      ) : (
        <p className="chat-panel__title">{roomName}</p>
      )}
      <div className="chat-conversation">
        <MessageList
          room={room}
          roomName={roomName}
          messages={chat.messages}
          moderator={info?.me.moderator}
          onAction={chat.act}
          onSeen={chat.markSeen}
        />
        <ChatNotice error={chat.error} notice={chat.notice} />
        {current?.canWrite ? (
          <ChatComposer user={user} guestName={info.me.guestName} onSend={chat.send} room={room} />
        ) : (
          current && <p className="chat-note">You can read this room, but not write in it.</p>
        )}
      </div>
    </section>
  );
}
