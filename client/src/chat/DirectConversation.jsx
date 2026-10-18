// ============================================================
// File:        DirectConversation.jsx
// Path:        client/src/chat/DirectConversation.jsx
// Project:     Seasonal Entertainment
// Description: One end-to-end encrypted conversation with another member: the messages,
//              decrypted in this browser (text with clickable links, a sticker or GIF from the
//              site's library; no file uploads and no link previews in v1), a notice wherever
//              the partner's security key changed, and the composer. A message made for an
//              earlier key cannot be read and says so. The partner's messages can be reported
//              (ReportDirectDialog: shared only with consent).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import DirectMessage from './DirectMessage.jsx';
import ReportDirectDialog from './ReportDirectDialog.jsx';
import { showDirect } from './directView.js';
import { useDirectConversation } from './useDirect.js';
import { useScrollPin } from './useScrollPin.js';
import './ChatMessage.css';

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

// partner: { id, username }; me: the signed-in account; keyId, privateKey: their key.
export default function DirectConversation({ partner, me, keyId, privateKey }) {
  const conversation = useDirectConversation(partner.id, keyId, privateKey);
  const { data, messages } = conversation;
  const list = useRef(null);
  const { onScroll, unseen, showNewest } = useScrollPin(list, `direct:${partner.id}`, messages);
  const library = useLibraryItems(messages);
  const [reporting, setReporting] = useState(null); // the message being reported
  const [notice, setNotice] = useState(null);

  async function sendReport(body) {
    const sent = await conversation.report(body);
    if (sent) setNotice('Report sent. Thank you.');
    return sent;
  }
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
                onReport={setReporting}
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
      <ChatNotice error={conversation.error} notice={notice} />
      {reporting && (
        <ReportDirectDialog
          messages={messages}
          reported={reporting}
          partnerName={name}
          onSend={sendReport}
          onClose={() => setReporting(null)}
        />
      )}
      {/* Writing starts once the partner's key is known: it is what the message is made for. */}
      {data && !data.partnerKey && (
        <p className="chat-note">{name} cannot receive private messages yet.</p>
      )}
      {data?.partnerKey && (
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
