// ============================================================
// File:        DirectMessage.jsx
// Path:        client/src/chat/DirectMessage.jsx
// Project:     Seasonal Entertainment
// Description: One decrypted direct message: author, local time, the text (links clickable) and
//              a sticker or GIF from the site's library; a message made for an earlier key says
//              it cannot be read. The partner's readable messages can be reported (onReport, from the
//              message's "…" menu, MessageMenu).
// ============================================================

import { MessageMedia, MessageText } from './MessageParts.jsx';
import MessageMenu from './MessageMenu.jsx';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

// library: the sticker/GIF items by id (null while not loaded).
export default function DirectMessage({ message, partnerName, ownName, library, onReport }) {
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
      {message.fromPartner && message.payload && (
        <MessageMenu
          items={[{ label: 'Report', run: () => onReport(message) }]}
          author={partnerName}
        />
      )}
    </li>
  );
}
