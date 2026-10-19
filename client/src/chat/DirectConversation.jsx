// ============================================================
// File:        DirectConversation.jsx
// Path:        client/src/chat/DirectConversation.jsx
// Project:     Seasonal Entertainment
// Description: One end-to-end encrypted conversation with another member: the messages,
//              decrypted in this browser (text with clickable links, a sticker or GIF from the
//              site's library; no file uploads and no link previews in v1), a notice wherever
//              the partner's security key changed (older pages too), older messages on reaching
//              the top (or with "Load older messages"), and the composer. A message made for an
//              earlier key cannot be read and says so. The partner's messages can be reported
//              (ReportDirectDialog: shared only with consent).
// ============================================================

import { useMemo, useRef, useState } from 'react';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import DirectMessage from './DirectMessage.jsx';
import ReportDirectDialog from './ReportDirectDialog.jsx';
import { showDirect } from './directView.js';
import { itemsById, useMediaLibrary } from './mediaLibrary.js';
import { useDirectConversation } from './useDirectConversation.js';
import { useOlderOnTop } from './useOlderOnTop.js';
import { useScrollPin } from './useScrollPin.js';
import './ChatMessage.css';

// The site's sticker/GIF library by item id (mediaLibrary.js, shared with the picker),
// loaded once a message uses one; when it cannot load, every item shows as unknown.
function useLibraryItems(messages) {
  const { packs, error } = useMediaLibrary(messages.some((m) => m.payload?.mediaItemId));
  return useMemo(() => (error ? new Map() : packs && itemsById(packs)), [packs, error]);
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
  const older = useOlderOnTop(list, messages[0]?.id, conversation);
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
          onScroll={() => {
            onScroll();
            older.onScroll();
          }}
        >
          {conversation.more && (
            <li className="chat-note">
              <button
                type="button"
                className="chat-link-button"
                disabled={conversation.loadingOlder}
                onClick={older.showOlder}
              >
                {conversation.loadingOlder ? 'Loading older messages…' : 'Load older messages'}
              </button>
            </li>
          )}
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
