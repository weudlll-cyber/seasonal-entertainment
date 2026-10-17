// ============================================================
// File:        ChatComposer.jsx
// Path:        client/src/chat/ChatComposer.jsx
// Project:     Seasonal Entertainment
// Description: Where a visitor writes in a room: the guest note, the message being written
//              (optional text plus at most one attachment, shown above the field with an ×),
//              the picker (emojis go into the text at the cursor; a member's sticker or GIF
//              becomes the attachment), a member's "Attach file" (an uploaded image or PDF
//              becomes the attachment) and Send, which sends both as one message.
// ============================================================

import { useRef, useState } from 'react';
import { MESSAGE_MAX } from '@seasonal-entertainment/shared/chatRules.js';
import ChatPicker from './ChatPicker.jsx';
import ComposerAttachment from './ComposerAttachment.jsx';
import ComposerUpload from './ComposerUpload.jsx';
import './ChatComposer.css';

// onSend(payload) resolves true when the message went out (then text and attachment clear).
// payload: { body, attachment?: { type: 'sticker' | 'gif', itemId } | { type: 'file', uploadId } }.
// files: offer "Attach file" to members (false in direct messages: no uploads there, v1).
export default function ChatComposer({ user, guestName, onSend, files = true }) {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null); // { type, item } or { type: 'file', upload }
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
    const payload = { body: draft };
    if (attachment?.type === 'file')
      payload.attachment = { type: 'file', uploadId: attachment.upload.id };
    else if (attachment) payload.attachment = { type: attachment.type, itemId: attachment.item.id };
    if (await onSend(payload)) {
      setDraft('');
      setAttachment(null);
    }
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
      {attachment && (
        <ComposerAttachment attachment={attachment} onRemove={() => setAttachment(null)} />
      )}
      <label>
        <span className="chat-label">Message</span>
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
          onMedia={(type, item) => setAttachment({ type, item })}
        />
        {user && files && (
          <ComposerUpload onUploaded={(upload) => setAttachment({ type: 'file', upload })} />
        )}
        <button className="chat-button" type="submit" disabled={!draft.trim() && !attachment}>
          Send
        </button>
      </div>
    </form>
  );
}
