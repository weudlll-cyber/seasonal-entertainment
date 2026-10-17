// ============================================================
// File:        ChatPage.jsx
// Path:        client/src/pages/ChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /chat: the full chat filling the main column, rooms on its left; only the
//              message list scrolls and the composer stays at the bottom. Everything chat lives
//              in the chat module (client/src/chat, docs/CHAT.md).
// ============================================================

import { ChatPanel } from '../chat/index.js';

export default function ChatPage() {
  return (
    <section className="chat-page">
      <h1 className="chat-page__title">Chat</h1>
      <ChatPanel room="general" variant="full" showRoomTabs />
    </section>
  );
}
