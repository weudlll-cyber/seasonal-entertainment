// ============================================================
// File:        ChatDrawer.jsx
// Path:        client/src/app/ChatDrawer.jsx
// Project:     Seasonal Entertainment
// Description: The chat on every page except /chat and /admin (docs/DESIGN.md, "Chat
//              drawer"): a round chat button bottom right opens a drawer over the page (the
//              page keeps its width) with "Open full chat", a close button, the room picker and
//              a compact chat panel. Closes by its close button or Escape; focus moves in when
//              opened and back to the button when closed. This browser remembers whether it was
//              open and the last room. No unread badge yet: the chat module cannot tell.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChatPanel, useChatRooms } from '../chat/index.js';
import {
  readDrawerState,
  rememberDrawerOpen,
  rememberDrawerRoom,
  roomToShow,
} from './chatDrawerState.js';
import Icon from './icons.jsx';
import RoomPicker from './RoomPicker.jsx';
import './ChatDrawer.css';

export default function ChatDrawer() {
  const { info } = useChatRooms();
  const [remembered] = useState(readDrawerState);
  const [open, setOpen] = useState(remembered.open);
  const [roomChoice, setRoomChoice] = useState(remembered.room);
  const room = roomToShow(roomChoice, info?.rooms);
  const launcher = useRef(null);
  const drawer = useRef(null);
  // Focus moves in only when the reader opened it, not when it is open after a reload.
  const focusWhenOpen = useRef(false);

  useEffect(() => {
    if (open && focusWhenOpen.current) {
      focusWhenOpen.current = false;
      drawer.current?.focus();
    }
  }, [open]);

  function openDrawer() {
    focusWhenOpen.current = true;
    setOpen(true);
    rememberDrawerOpen(true);
  }

  function closeDrawer() {
    setOpen(false);
    rememberDrawerOpen(false);
    launcher.current?.focus();
  }

  function changeRoom(slug) {
    setRoomChoice(slug);
    rememberDrawerRoom(slug);
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="chat-launcher"
        aria-label="Chat"
        aria-expanded={open}
        aria-controls="chat-drawer"
        onClick={open ? closeDrawer : openDrawer}
      >
        <Icon name="chat" size={28} />
      </button>
      {open && (
        <section
          ref={drawer}
          id="chat-drawer"
          className="chat-drawer"
          role="dialog"
          aria-label="Chat"
          tabIndex={-1}
          onKeyDown={(event) => event.key === 'Escape' && closeDrawer()}
        >
          <div className="chat-drawer__header">
            <Link to="/chat" className="chat-drawer__full">
              Open full chat
            </Link>
            <button
              type="button"
              className="icon-button"
              aria-label="Close chat"
              onClick={closeDrawer}
            >
              <Icon name="close" />
            </button>
          </div>
          {info && room && <RoomPicker rooms={info.rooms} value={room} onChange={changeRoom} />}
          {room && <ChatPanel room={room} variant="compact" />}
        </section>
      )}
    </>
  );
}
