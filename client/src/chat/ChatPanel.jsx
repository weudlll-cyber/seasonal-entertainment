// ============================================================
// File:        ChatPanel.jsx
// Path:        client/src/chat/ChatPanel.jsx
// Project:     Seasonal Entertainment
// Description: The chat module's one public component (docs/CHAT.md): a room's live messages,
//              per-message actions and the composer, for whoever is signed in (or a guest);
//              the connection-limit line when the live connection was refused (too many);
//              for organisers and admins a "Poll" button that opens the poll form for this
//              room (polls/PollForm.jsx; its card then shows in the timeline).
//              Self-contained: data, the shared live connection and styles live in this
//              folder; it needs only its props and the site's account context.
// ============================================================

import { useState } from 'react';
import PollForm from '../polls/PollForm.jsx';
import { useSession } from '../session/SessionContext.jsx';
import ChatButton, { ChatVariant } from './ChatButton.jsx';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import ConnectionLimitNotice from './ConnectionLimitNotice.jsx';
import MessageList from './MessageList.jsx';
import RoomTabs from './RoomTabs.jsx';
import { useChatRoom } from './useChatRoom.js';
import './ChatPanel.css';
import './ChatPanelVariants.css';
import './ChatPicker.css';
import './ChatFavourites.css';

// room: slug of the room shown; when it changes the panel follows (a host's room picker).
// variant: 'full' (a page of its own) or 'compact' (a box beside other content); also given to
// its buttons (ChatVariant, ChatButton.jsx).
// showRoomTabs: let the reader switch between their rooms (favourites first, RoomTabs);
// unlisted: the room may be one not in the room lists (a call's chat, or a link to one), so it
// is asked for by name.
// roomNote: a host's line for its own room (RoomPanel: "This room isn't available."), shown
// until the reader picks another room.
// files: the composer's "Attach file" for members (ChatComposer); false where uploads are refused
// (it also goes while the "File uploads in rooms" setting is off).
// guestPrompt: shown to a guest instead of the composer where a guest cannot write (the chat
// embedded on another site: a guest name needs a cookie there); null keeps the guest composer.
// emptyText: said inside the list once the room's messages have loaded and there are none
// (a call's chat after the call); null leaves an empty list empty.
// readOnlyNote: the host's own words where the reader cannot write (a call's chat after the
// call: "This call's chat is closed."); null keeps the general line.
export default function ChatPanel({
  room: roomInput,
  variant = 'full',
  showRoomTabs = false,
  unlisted = false,
  files = true,
  guestPrompt = null,
  roomNote = null,
  emptyText = null,
  readOnlyNote = null,
}) {
  const { user, settings } = useSession();
  const chat = useChatRoom(roomInput, user, unlisted);
  const { info, room, current } = chat;
  const roomName = current?.name ?? room;
  const [pollForm, setPollForm] = useState(false); // the room's poll form is open

  return (
    <section
      className={`se-chat se-chat--${variant}${showRoomTabs ? ' se-chat--rooms' : ''}`}
      aria-label={`Chat: ${roomName}`}
    >
      <ChatVariant.Provider value={variant}>
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
            emptyText={chat.loaded ? emptyText : null}
            moderator={info?.me.moderator}
            onAction={chat.act}
            onSeen={chat.markSeen}
          />
          <ConnectionLimitNotice />
          <ChatNotice
            error={chat.error}
            notice={chat.notice ?? (room === roomInput ? roomNote : null)}
          />
          {current?.canWrite ? (
            !user && guestPrompt ? (
              guestPrompt
            ) : (
              <>
                {pollForm && (
                  <div className="chat-poll-form">
                    <PollForm room={room} onCreated={() => setPollForm(false)} />
                  </div>
                )}
                <ChatComposer
                  user={user}
                  guestName={info.me.guestName}
                  onSend={chat.send}
                  room={room}
                  files={files && settings['chat.uploads']}
                  actions={
                    // Organisers and admins start a poll in this room (docs/POLLS.md).
                    info?.me.moderator && (
                      <ChatButton
                        icon="poll"
                        text={pollForm ? 'Close poll form' : 'Poll'}
                        secondary
                        aria-expanded={pollForm}
                        onClick={() => setPollForm(!pollForm)}
                      />
                    )
                  }
                />
              </>
            )
          ) : (
            current && (
              <p className="chat-note">
                {readOnlyNote ?? 'You can read this room, but not write in it.'}
              </p>
            )
          )}
        </div>
      </ChatVariant.Provider>
    </section>
  );
}
