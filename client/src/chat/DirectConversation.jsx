// ============================================================
// File:        DirectConversation.jsx
// Path:        client/src/chat/DirectConversation.jsx
// Project:     Seasonal Entertainment
// Description: One end-to-end encrypted conversation with another member: the messages,
//              decrypted in this browser (text with clickable links, a sticker or GIF from the
//              site's library; no file uploads and no link previews in v1), a notice wherever
//              the partner's security key changed, and the composer. A message made for an
//              earlier key cannot be read and says so.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import { MessageMedia, MessageText } from './MessageParts.jsx';
import { showDirect } from './directView.js';
import { useDirectConversation } from './useDirect.js';
import { useScrollPin } from './useScrollPin.js';
import './ChatMessage.css';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

// The site's sticker/GIF library by item id, loaded once a message uses one.
function useLibraryItems(messages) {
  const [items, setItems] = useState(null);
  const needed = messages.some((m) => m.payload?.mediaItemId);
  useEffect(() => {
    if (!needed || items) return;
    api('/chat/media')
      .then(({ packs }) => {
        const byId = new Map();
        for (const pack of packs) {
          for (const item of pack.items) byId.set(item.id, { ...item, kind: pack.kind });
        }
        setItems(byId);
      })
      .catch(() => setItems(new Map()));
  }, [needed, items]);
  return items;
}

// Messages with a notice before each change of the partner's key (and at the end when the
// current key is newer than the last message's).
function withKeyNotices(messages, currentKeyId) {
  const rows = [];
  let previous = null;
  for (const m of messages) {
    if (previous !== null && m.partnerKeyId !== previous) rows.push({ notice: `key-${m.id}` });
    rows.push(m);
    previous = m.partnerKeyId;
  }
  if (previous !== null && currentKeyId && currentKeyId !== previous)
    rows.push({ notice: 'key-now' });
  return rows;
}

function DirectMessage({ message, partnerName, ownName, library }) {
  const item = message.payload?.mediaItemId && library?.get(message.payload.mediaItemId);
  return (
    <li className="chat-message">
      <div className="chat-message__meta">
        <strong>{message.fromPartner ? partnerName : ownName}</strong>
        <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
      </div>
      {!message.payload && (
        <p className="chat-note">This message was made for an earlier key and cannot be read.</p>
      )}
      {message.payload?.text && (
        <p className="chat-message__text">
          <MessageText body={message.payload.text} linkify />
        </p>
      )}
      {message.payload?.mediaItemId && library && (
        <MessageMedia kind={item?.kind} media={item ?? null} />
      )}
    </li>
  );
}

// partner: { id, username }; me: the signed-in account; keyId, privateKey: their key.
export default function DirectConversation({ partner, me, keyId, privateKey }) {
  const conversation = useDirectConversation(partner.id, keyId, privateKey);
  const { data, messages } = conversation;
  const list = useRef(null);
  const { onScroll, unseen, showNewest } = useScrollPin(list, `direct:${partner.id}`, messages);
  const library = useLibraryItems(messages);
  const name = data?.partner.username ?? partner.username;

  return (
    <div className="chat-conversation chat-direct">
      <div className="chat-direct__header">
        <button
          type="button"
          className="chat-link-button"
          aria-label="All private conversations"
          onClick={() => showDirect(null)}
        >
          ←
        </button>
        <strong>{name}</strong>
        {data?.partner.online && <span className="chat-online">online</span>}
      </div>
      <div className="chat-messages-frame">
        <ol
          ref={list}
          className="chat-messages"
          aria-label={`Private messages with ${name}`}
          onScroll={onScroll}
        >
          {withKeyNotices(messages, data?.partnerKey?.keyId).map((row) =>
            row.notice ? (
              <li key={row.notice} className="chat-note chat-key-notice">
                {name}&apos;s security key changed
              </li>
            ) : (
              <DirectMessage
                key={row.id}
                message={row}
                partnerName={name}
                ownName={me.username}
                library={library}
              />
            )
          )}
        </ol>
        {unseen && (
          <button type="button" className="chat-new-messages" onClick={showNewest}>
            New messages
          </button>
        )}
      </div>
      <ChatNotice error={conversation.error} />
      {data && !data.partnerKey ? (
        <p className="chat-note">{name} cannot receive private messages yet.</p>
      ) : (
        <ChatComposer
          user={me}
          files={false}
          onSend={({ body, attachment }) =>
            conversation.send({ text: body, ...(attachment && { mediaItemId: attachment.itemId }) })
          }
        />
      )}
    </div>
  );
}
