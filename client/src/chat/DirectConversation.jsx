// ============================================================
// File:        DirectConversation.jsx
// Path:        client/src/chat/DirectConversation.jsx
// Project:     Seasonal Entertainment
// Description: One end-to-end encrypted conversation with another member: the messages,
//              decrypted in this browser (text with clickable links, a sticker or GIF from the
//              site's library, a link preview card made while writing: useDirectLinkPreview,
//              unless the member switched it off; a file, encrypted in this browser before it
//              is uploaded: directFile.js), a notice wherever
//              the partner's security key changed (older pages too), older messages on reaching
//              the top (or with "Load older messages"), and the composer. A message made for an
//              earlier key cannot be read and says so. The partner's messages can be reported
//              (ReportDirectDialog: shared only with consent). The header's "…" opens "Verify
//              safety number" (SafetyNumberDialog); a number marked as verified on this device
//              shows a "Verified" badge, and a partner key that changed since this device last
//              saw it a notice above the messages (useSafetyNumber).
// ============================================================

import { useMemo, useRef, useState } from 'react';
import ChatComposer from './ChatComposer.jsx';
import ChatNotice from './ChatNotice.jsx';
import DirectMessage from './DirectMessage.jsx';
import MenuButton from './MenuButton.jsx';
import ReportDirectDialog from './ReportDirectDialog.jsx';
import SafetyNumberDialog from './SafetyNumberDialog.jsx';
import { showDirect } from './directView.js';
import { uploadDirectFile } from './directFile.js';
import { itemsById, useMediaLibrary } from './mediaLibrary.js';
import PreviewCard from './PreviewCard.jsx';
import { useDirectLinkPreview } from './useDirectLinkPreview.js';
import { useDirectConversation } from './useDirectConversation.js';
import { useOlderOnTop } from './useOlderOnTop.js';
import { useSafetyNumber } from './useSafetyNumber.js';
import { useScrollPin } from './useScrollPin.js';
import './ChatMessage.css';
import './ChatSafety.css';

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
  const safety = useSafetyNumber(me?.id, partner.id, data?.partnerKey ?? null, privateKey);
  const [verifying, setVerifying] = useState(false);
  const [draft, setDraft] = useState('');
  // The member's own setting, as the session reports it (on unless switched off).
  const linkPreview = useDirectLinkPreview(draft, me?.dmLinkPreviews !== false);
  const card = linkPreview.card;
  // This conversation's uploads by id: the composer hands back only the id when sending.
  const uploads = useRef(new Map());
  async function uploadFile(file) {
    const done = await uploadDirectFile(partner.id, file);
    uploads.current.set(done.id, done);
    return done;
  }

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
        {safety.verified && <span className="chat-safety__badge">Verified</span>}
        {data?.partnerKey && (
          <MenuButton
            items={[{ label: 'Verify safety number', run: () => setVerifying(true) }]}
            label={`Conversation with ${name}`}
            buttonLabel={`Actions for the conversation with ${name}`}
            className="chat-message__more"
          >
            <span aria-hidden="true">…</span>
          </MenuButton>
        )}
      </div>
      {/* Trust on first use: this device saw another key before. Sending stays possible. */}
      {safety.keyChanged && (
        <p className="chat-safety__notice" role="status">
          {name}&apos;s security key changed — verify the safety number again
        </p>
      )}
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
                {name}&apos;s security key changed — verify the safety number again
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
      {verifying && (
        <SafetyNumberDialog
          safety={safety}
          partnerName={name}
          onClose={() => setVerifying(false)}
        />
      )}
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
          uploadFile={uploadFile}
          accept=""
          onDraft={setDraft}
          above={
            card && (
              <div className="chat-attachment" role="group" aria-label="Link preview">
                <PreviewCard preview={{ ...card, image: card.image && { url: card.image } }} />
                <button
                  type="button"
                  className="chat-attachment__remove"
                  aria-label="Remove link preview"
                  title="Remove link preview"
                  onClick={linkPreview.remove}
                >
                  ×
                </button>
              </div>
            )
          }
          onSend={({ body, attachment }) =>
            conversation.send({
              text: body,
              ...(attachment?.itemId && { mediaItemId: attachment.itemId }),
              // The file's key, name and type travel only inside the encrypted message.
              ...(attachment?.uploadId && {
                file: (({ id, key, name, type, bytes }) => ({ id, key, name, type, bytes }))(
                  uploads.current.get(attachment.uploadId)
                ),
              }),
              // The card travels inside the encrypted message, as the writer saw it.
              ...(card && { preview: card }),
            })
          }
        />
      )}
    </div>
  );
}
