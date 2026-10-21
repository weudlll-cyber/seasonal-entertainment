// ============================================================
// File:        ChatComposer.jsx
// Path:        client/src/chat/ChatComposer.jsx
// Project:     Seasonal Entertainment
// Description: Where a visitor writes in a room: the guest note, the message being written
//              (optional text plus at most one attachment, shown above the field with an ×),
//              the picker (emojis go into the text at the cursor; a member's sticker or GIF
//              becomes the attachment), a member's "Attach file" (an uploaded image or PDF
//              becomes the attachment) and Send, which sends both as one message. In a room, a
//              member typing "@" gets mention suggestions (MentionSuggestions). The buttons carry
//              an icon and their text; the compact variant (the drawer, a call's chat) shows one
//              row — field and icon buttons, the texts kept as their names (ChatComposer.css).
//              A host may follow the draft (onDraft) and show something above the field
//              (above: a direct message's link preview card, DirectConversation.jsx).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { MESSAGE_MAX } from '@seasonal-entertainment/shared/chatRules.js';
import Icon from '../app/icons.jsx';
import ChatPicker from './ChatPicker.jsx';
import ComposerAttachment from './ComposerAttachment.jsx';
import ComposerUpload from './ComposerUpload.jsx';
import { useMentionSuggestions } from './MentionSuggestions.jsx';
import './ChatComposer.css';

// onSend(payload) resolves true when the message went out (then text and attachment clear).
// payload: { body, attachment?: { type: 'sticker' | 'gif', itemId } | { type: 'file', uploadId } }.
// files: offer "Attach file" to members (false in direct messages: no uploads there, v1).
// room: the room's slug, for @mention suggestions (none in direct messages, none for guests).
// onDraft(text): told every change of the text (also its clearing after sending); above: shown
// above the field.
export default function ChatComposer({
  user,
  guestName,
  onSend,
  files = true,
  room = null,
  onDraft,
  above = null,
}) {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null); // { type, item } or { type: 'file', upload }
  const field = useRef(null);
  const mentions = useMentionSuggestions({ field, draft, setDraft, room: user ? room : null });
  useEffect(() => onDraft?.(draft), [draft, onDraft]);

  // Inserts at the cursor (or replaces the selection), never beyond the length limit, and
  // puts the cursor right after the emoji.
  function insertEmoji(emoji) {
    const { selectionStart: start, selectionEnd: end } = field.current;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > MESSAGE_MAX) return;
    setDraft(next);
    // A frame later the composer may be gone (the panel closed): then there is nothing to do.
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(start + emoji.length, start + emoji.length);
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
      {above}
      {mentions.list}
      <label>
        <span className="chat-label">Message</span>
        <textarea
          ref={field}
          rows={2}
          maxLength={MESSAGE_MAX}
          value={draft}
          {...mentions.fieldProps}
          onChange={(e) => {
            setDraft(e.target.value);
            mentions.trackCaret(e);
          }}
          onKeyDown={mentions.onKeyDown}
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
          <Icon name="send" size={20} />
          <span className="chat-button__text">Send</span>
        </button>
      </div>
    </form>
  );
}
