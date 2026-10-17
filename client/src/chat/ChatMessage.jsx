// ============================================================
// File:        ChatMessage.jsx
// Path:        client/src/chat/ChatMessage.jsx
// Project:     Seasonal Entertainment
// Description: One chat message: author (with a Guest badge), local time, the text as plain
//              text (members' http(s) links become links; guests' never), Report, and for
//              moderators Hide / Mute / Ban.
// ============================================================

import { splitLinks } from '@seasonal-entertainment/shared/chatRules.js';

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
      <p className="chat-message__text">
        <MessageText body={message.body} linkify={!message.isGuest} />
      </p>
      <div className="chat-message__actions">
        <button className="link-button" type="button" onClick={() => onAction('report', message)}>
          Report
        </button>
        {moderator && !message.hiddenAt && (
          <>
            <button className="link-button" type="button" onClick={() => onAction('hide', message)}>
              Hide
            </button>
            {[10, 60, 1440].map((minutes) => (
              <button
                key={minutes}
                className="link-button"
                type="button"
                onClick={() => onAction('mute', message, minutes)}
              >
                Mute {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
              </button>
            ))}
            <button className="link-button" type="button" onClick={() => onAction('ban', message)}>
              Ban
            </button>
          </>
        )}
      </div>
    </li>
  );
}
