// ============================================================
// File:        ChatComposer.jsx
// Path:        client/src/chat/ChatComposer.jsx
// Project:     Seasonal Entertainment
// Description: Where a visitor writes in a room: the guest note, the message field, the picker
//              (emojis go into the text at the cursor; a member's sticker or GIF is sent at
//              once) and Send. The page does the sending.
// ============================================================

import { useRef, useState } from 'react';
import { MESSAGE_MAX } from '@seasonal-entertainment/shared/chatRules.js';
import ChatPicker from './ChatPicker.jsx';

// onSend(payload) resolves true when the message went out: { body } for text (the field is
// then cleared), { kind, itemId } for a sticker or GIF.
export default function ChatComposer({ user, guestName, onSend }) {
  const [draft, setDraft] = useState('');
  const field = useRef(null);

  // Inserts at the cursor (or replaces the selection), never beyond the length limit, and
  // puts the cursor right after the emoji.
  function insertEmoji(emoji) {
    const { selectionStart: start, selectionEnd: end } = field.current;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > MESSAGE_MAX) return;
    setDraft(next);
    requestAnimationFrame(() => {
      field.current.focus();
      field.current.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (await onSend({ body: draft })) setDraft('');
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      {!user && (
        <p className="chat-note">
          {guestName
            ? `You are writing as ${guestName} (guest). Links are for members only.`
            : 'You are a guest: your first message gets a guest name. Links are for members only.'}
        </p>
      )}
      <label>
        <span className="form-field__label">Message</span>
        <textarea
          ref={field}
          rows={2}
          maxLength={MESSAGE_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <div className="chat-composer__actions">
        <ChatPicker
          member={Boolean(user)}
          onEmoji={insertEmoji}
          onMedia={(kind, item) => onSend({ kind, itemId: item.id })}
        />
        <button className="button" type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
