// ============================================================
// File:        ChatDrawer.jsx
// Path:        client/src/app/ChatDrawer.jsx
// Project:     Seasonal Entertainment
// Description: The chat on every page except /chat and /admin (docs/DESIGN.md, "Chat
//              drawer"): a round chat button bottom right opens a drawer over the page (the
//              page keeps its width) with "Open full chat", the chat menu (members:
//              NotificationsMenu), a close button and, for members,
//              the tabs "Rooms" (DrawerRooms: room picker and a compact chat panel) and
//              "Direct" (DirectTab: private messages); guests see the rooms only. "Send private
//              message" in a name menu opens the drawer on the Direct tab. Closes by its close
//              button or Escape; focus moves in when opened and back to the button when closed.
//              This browser remembers whether it was open and the last room. The chat button
//              carries the unread counters (UnreadDots), also in its accessible name.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { onDirectRequest, useUnread } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';
import ChatTabs from './ChatTabs.jsx';
import { readDrawerState, rememberDrawerOpen } from './chatDrawerState.js';
import DirectTab from './DirectTab.jsx';
import DrawerRooms from './DrawerRooms.jsx';
import NotificationsMenu from '../notify/NotificationsMenu.jsx';
import Icon from './icons.jsx';
import UnreadDots, { unreadSummary } from './UnreadDots.jsx';
import './ChatDrawer.css';

export default function ChatDrawer() {
  const { user } = useSession();
  const unread = useUnread();
  const [open, setOpen] = useState(() => readDrawerState().open);
  const [tab, setTab] = useState('rooms');
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

  // "Send private message" in a name menu: the drawer opens on the Direct tab.
  useEffect(
    () =>
      onDirectRequest(() => {
        setTab('direct');
        setOpen(true);
        rememberDrawerOpen(true);
      }),
    []
  );

  function closeDrawer() {
    setOpen(false);
    rememberDrawerOpen(false);
    launcher.current?.focus();
  }

  // Guests have no direct messages: for them there are only rooms.
  const shown = user ? tab : 'rooms';

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="chat-launcher"
        aria-label={`Chat${unreadSummary(unread)}`}
        aria-expanded={open}
        aria-controls="chat-drawer"
        onClick={open ? closeDrawer : openDrawer}
      >
        <Icon name="chat" size={24} />
        <span className="chat-launcher__counts">
          <UnreadDots />
        </span>
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
            <NotificationsMenu />
            <button
              type="button"
              className="icon-button"
              aria-label="Close chat"
              onClick={closeDrawer}
            >
              <Icon name="close" />
            </button>
          </div>
          {user && (
            <ChatTabs
              value={shown}
              onChange={setTab}
              idPrefix="drawer"
              counts={{ rooms: unread.roomTotal, direct: unread.directTotal }}
            />
          )}
          <div
            id="drawer-panel"
            className="chat-drawer__panel"
            {...(user && { role: 'tabpanel', 'aria-labelledby': `drawer-tab-${shown}` })}
          >
            {shown === 'rooms' ? <DrawerRooms /> : <DirectTab variant="compact" />}
          </div>
        </section>
      )}
    </>
  );
}
