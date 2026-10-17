// ============================================================
// File:        index.js
// Path:        client/src/chat/index.js
// Project:     Seasonal Entertainment
// Description: The chat module's public entry: the ChatPanel component and the useChatRooms
//              hook (the rooms the reader may read, for a host's own room picker). Pages
//              import only from here; everything else in this folder is internal
//              (docs/CHAT.md).
// ============================================================

export { default as ChatPanel } from './ChatPanel.jsx';
export { useChatRooms } from './useChatRooms.js';
