// ============================================================
// File:        ChatPicker.jsx
// Path:        client/src/chat/ChatPicker.jsx
// Project:     Seasonal Entertainment
// Description: The picker next to the chat message field: a toggle button opens a panel with
//              the emoji groups (emojis.js); choosing one hands it to the composer, which puts
//              it into the text at the cursor.
// ============================================================

import { useState } from 'react';
import { EMOJI_GROUPS } from './emojis.js';
import './ChatPicker.css';

function EmojiTab({ onEmoji }) {
  return EMOJI_GROUPS.map(([group, emojis]) => (
    <section key={group} className="chat-picker__group" aria-label={group}>
      <h3 className="chat-picker__heading">{group}</h3>
      <div className="chat-picker__grid">
        {emojis.map(([emoji, name]) => (
          <button
            key={emoji}
            type="button"
            className="chat-picker__emoji"
            aria-label={name}
            title={name}
            onClick={() => onEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </section>
  ));
}

export default function ChatPicker({ onEmoji }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="chat-picker">
      <button
        type="button"
        className="button button--secondary"
        aria-expanded={open}
        aria-controls="chat-picker-panel"
        onClick={() => setOpen((o) => !o)}
      >
        Emoji
      </button>
      {open && (
        <div id="chat-picker-panel" className="chat-picker__panel">
          <EmojiTab onEmoji={onEmoji} />
        </div>
      )}
    </div>
  );
}
