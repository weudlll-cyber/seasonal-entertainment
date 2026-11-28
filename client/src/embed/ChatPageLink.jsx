// ============================================================
// File:        ChatPageLink.jsx
// Path:        client/src/embed/ChatPageLink.jsx
// Project:     Seasonal Entertainment
// Description: The low embedded chat's "Open the chat page", an icon in the input's row: the
//              room's full chat in a new tab, where scrolling back and reporting are; the game
//              stays (EmbedChatPage.jsx).
// ============================================================

import Icon from '../app/icons.jsx';

const NAME = 'Open the chat page';

export default function ChatPageLink({ room }) {
  return (
    <a
      className="embed-chat-page"
      href={`/chat?room=${encodeURIComponent(room)}`}
      target="_blank"
      rel="noopener"
      aria-label={NAME}
      title={NAME}
    >
      <Icon name="external" size={18} />
    </a>
  );
}
