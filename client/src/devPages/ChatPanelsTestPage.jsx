// ============================================================
// File:        ChatPanelsTestPage.jsx
// Path:        client/src/devPages/ChatPanelsTestPage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (/test/chat-panels, routed only by the Vite dev server, never in
//              production builds): two compact chat panels for two rooms side by side, to prove
//              the chat module can be placed anywhere and that panels share one connection.
// ============================================================

import { ChatPanel } from '../chat/index.js';

export default function ChatPanelsTestPage() {
  return (
    <section className="page page--wide">
      <h1>Chat panels (test page)</h1>
      <div className="dev-panels">
        <ChatPanel room="general" variant="compact" />
        <ChatPanel room="announcements" variant="compact" />
      </div>
    </section>
  );
}
