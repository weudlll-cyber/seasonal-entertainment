// ============================================================
// File:        index.js
// Path:        client/src/chat/index.js
// Project:     Seasonal Entertainment
// Description: The chat module's public entry: the ChatPanel component; for a host's own room
//              picker the useChatRooms hook (the rooms the reader may read), the member's
//              favourites (useFavourites, groupRooms), the room star and bell; the direct-message
//              view (DirectPanel) and onDirectRequest (a name menu asked for a conversation); the
//              unread counters (useUnread, UnreadCount); for a host's own panels a small keyboard
//              menu (MenuButton) and the new-message count of a hidden room (useNewMessageCount);
//              the member's own live events for other areas of the site (usePersonalEvents: call
//              reminders, a new device asking for the key, notifications) and a room's newest
//              messages with the online count (useRoomGlimpse: the home page's Community box).
//              Pages import only from here; everything else in this folder is internal
//              (docs/CHAT.md).
// ============================================================

export { default as ChatPanel } from './ChatPanel.jsx';
export { default as DirectPanel } from './DirectPanel.jsx';
// requestDirect: open a member's conversation from outside (a notification's click).
export { onDirectRequest, requestDirect } from './directView.js';
export { useUnread } from './unread.js';
export { default as UnreadCount } from './UnreadCount.jsx';
export { groupRooms, useFavourites } from './favourites.js';
export { default as RoomBell } from './RoomBell.jsx';
export { default as RoomStar } from './RoomStar.jsx';
export { useChatRooms } from './useChatRooms.js';
export { default as MenuButton } from './MenuButton.jsx';
export { useNewMessageCount } from './useNewMessageCount.js';
export { usePersonalEvents } from './usePersonalEvents.js';
export { useRoomGlimpse } from './useRoomGlimpse.js';
