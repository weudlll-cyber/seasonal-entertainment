// ============================================================
// File:        ChatPage.jsx
// Path:        client/src/pages/ChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /chat: the site's chat page, a heading and one full chat panel with room tabs.
//              Everything chat lives in the chat module (client/src/chat, docs/CHAT.md).
// ============================================================

import { ChatPanel } from '../chat/index.js';

export default function ChatPage() {
  return (
    <section className="page page--wide">
      <h1>Chat</h1>
      <ChatPanel room="general" variant="full" showRoomTabs />
    </section>
  );
}
