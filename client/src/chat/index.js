// ============================================================
// File:        index.js
// Path:        client/src/chat/index.js
// Project:     Seasonal Entertainment
// Description: The chat module's public entry: the ChatPanel component; for a host's own room
//              picker the useChatRooms hook (the rooms the reader may read), the member's
//              favourites (useFavourites, groupRooms), the room star and bell; the direct-message
//              view (DirectPanel) and onDirectRequest (a name menu asked for a conversation);
//              the unread counters (useUnread, UnreadCount).
//              Pages import only from here; everything else in this folder is internal
//              (docs/CHAT.md).
// ============================================================

export { default as ChatPanel } from './ChatPanel.jsx';
export { default as DirectPanel } from './DirectPanel.jsx';
export { onDirectRequest } from './directView.js';
export { useUnread } from './unread.js';
export { default as UnreadCount } from './UnreadCount.jsx';
export { groupRooms, useFavourites } from './favourites.js';
export { default as RoomBell } from './RoomBell.jsx';
export { default as RoomStar } from './RoomStar.jsx';
export { useChatRooms } from './useChatRooms.js';
