// ============================================================
// File:        ChatButton.jsx
// Path:        client/src/chat/ChatButton.jsx
// Project:     Seasonal Entertainment
// Description: A composer button (Send, the picker, Attach file): an icon and its text. The
//              compact chat (the drawer, a call's chat, the embedded chat) hides the text and
//              keeps it as the name (ChatComposer.css), so there the text is also the tooltip a
//              mouse user sees; where the text shows, there is none. ChatVariant carries the
//              panel's variant down (ChatPanel, DirectPanel).
// ============================================================

import { createContext, useContext } from 'react';
import Icon from '../app/icons.jsx';

export const ChatVariant = createContext('full');

// icon: an app/icons.jsx name; text: what a click does; secondary: the quieter look; the rest
// (type, disabled, onClick, aria-expanded, …) goes to the button.
export default function ChatButton({ icon, text, secondary = false, ...rest }) {
  const compact = useContext(ChatVariant) === 'compact';
  return (
    <button
      type="button"
      className={`chat-button${secondary ? ' chat-button--secondary' : ''}`}
      title={compact ? text : undefined}
      {...rest}
    >
      <Icon name={icon} size={20} />
      <span className="chat-button__text">{text}</span>
    </button>
  );
}
