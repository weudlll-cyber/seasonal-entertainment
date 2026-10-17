// ============================================================
// File:        index.js
// Path:        client/src/chat/index.js
// Project:     Seasonal Entertainment
// Description: The chat module's public entry: the ChatPanel component; for a host's own room
//              picker the useChatRooms hook (the rooms the reader may read), the member's
//              favourites (useFavourites, groupRooms) and the room star. Pages import only
//              from here; everything else in this folder is internal (docs/CHAT.md).
// ============================================================

export { default as ChatPanel } from './ChatPanel.jsx';
export { groupRooms, useFavourites } from './favourites.js';
export { default as RoomStar } from './RoomStar.jsx';
export { useChatRooms } from './useChatRooms.js';
