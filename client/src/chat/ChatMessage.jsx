// ============================================================
// File:        ChatMessage.jsx
// Path:        client/src/chat/ChatMessage.jsx
// Project:     Seasonal Entertainment
// Description: One chat message: author (with a Guest badge), local time, then its text as
//              plain text (members' https links become links; guests' never) and its sticker /
//              GIF from the site's library ("Media removed" once it is gone), a link preview
//              card (PreviewCard), an uploaded file (MessageFile), Report, and for
//              moderators Hide / Mute / Ban / Remove file / Remove preview.
// ============================================================

import { useState } from 'react';
import { splitLinks } from '@seasonal-entertainment/shared/chatRules.js';
import MessageFile from './MessageFile.jsx';
import PreviewCard from './PreviewCard.jsx';
import './ChatMessage.css';

function MessageText({ body, linkify }) {
  if (!linkify) return body;
  return splitLinks(body).map((part, i) =>
    part.link ? (
      <a key={i} href={part.link} target="_blank" rel="nofollow noopener noreferrer ugc">
        {part.link}
      </a>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

// A sticker (fixed size) or GIF (at most 240 px wide). A credit shows on hover (title) and,
// for touch screens, on a tap.
function MessageMedia({ kind, media }) {
  const [showCredit, setShowCredit] = useState(false);
  if (!media) return <p className="chat-message__removed">Media removed</p>;
  const image = (
    <img
      className={`chat-media chat-media--${kind}`}
      src={media.url}
      alt={media.alt}
      width={media.width}
      height={media.height}
      loading="lazy"
    />
  );
  if (!media.credit) return <div className="chat-message__media">{image}</div>;
  return (
    <figure className="chat-message__media" title={`Credit: ${media.credit}`}>
      <button
        type="button"
        className="chat-media__toggle"
        aria-expanded={showCredit}
        onClick={() => setShowCredit((shown) => !shown)}
      >
        {image}
      </button>
      {showCredit && <figcaption className="chat-note">Credit: {media.credit}</figcaption>}
    </figure>
  );
}

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export default function ChatMessage({ message, moderator, onAction }) {
  return (
    <li className={`chat-message${message.hiddenAt ? ' chat-message--hidden' : ''}`}>
      <div className="chat-message__meta">
        <strong>{message.author}</strong>
        {message.isGuest && <span className="chat-badge">Guest</span>}
        <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
        {message.hiddenAt && <em>hidden by {message.hiddenBy}</em>}
      </div>
      {message.body && (
        <p className="chat-message__text">
          <MessageText body={message.body} linkify={!message.isGuest} />
        </p>
      )}
      {(message.kind === 'sticker' || message.kind === 'gif') && (
        <MessageMedia kind={message.kind} media={message.media} />
      )}
      {message.file && <MessageFile file={message.file} />}
      {message.preview && <PreviewCard preview={message.preview} />}
      {message.previewHeld && (
        <p className="chat-note">Preview hidden from others until the reports are reviewed.</p>
      )}
      <div className="chat-message__actions">
        <button
          className="chat-link-button"
          type="button"
          onClick={() => onAction('report', message)}
        >
          Report
        </button>
        {moderator && !message.hiddenAt && (
          <>
            <button
              className="chat-link-button"
              type="button"
              onClick={() => onAction('hide', message)}
            >
              Hide
            </button>
            {[10, 60, 1440].map((minutes) => (
              <button
                key={minutes}
                className="chat-link-button"
                type="button"
                onClick={() => onAction('mute', message, minutes)}
              >
                Mute {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
              </button>
            ))}
            <button
              className="chat-link-button"
              type="button"
              onClick={() => onAction('ban', message)}
            >
              Ban
            </button>
            {message.file && !message.file.removed && (
              <button
                className="chat-link-button"
                type="button"
                onClick={() => onAction('file/remove', message)}
              >
                Remove file
              </button>
            )}
            {message.preview && (
              <button
                className="chat-link-button"
                type="button"
                onClick={() => onAction('preview/remove', message)}
              >
                Remove preview
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
