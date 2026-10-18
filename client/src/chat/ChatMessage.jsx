// ============================================================
// File:        ChatMessage.jsx
// Path:        client/src/chat/ChatMessage.jsx
// Project:     Seasonal Entertainment
// Description: One chat message: author (with a Guest badge; a member's name opens the name
//              menu, NameMenu), local time, then its text (MessageParts: members' https links
//              become links, @mentions name chips) and its sticker / GIF from the site's
//              library, a link preview card (PreviewCard), an uploaded file (MessageFile),
//              Report, and for moderators Hide / Mute / Ban / Remove file / Remove preview. A
//              message that mentions the reader is highlighted for them.
// ============================================================

import { useSession } from '../session/SessionContext.jsx';
import MessageFile from './MessageFile.jsx';
import { MessageMedia, MessageText } from './MessageParts.jsx';
import NameMenu from './NameMenu.jsx';
import PreviewCard from './PreviewCard.jsx';
import './ChatMessage.css';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export default function ChatMessage({ message, moderator, onAction }) {
  const { user } = useSession();
  // A message mentioning the reader stands out for them.
  const mentionsMe = Boolean(user) && (message.mentions ?? []).some((m) => m.id === user.id);
  return (
    <li
      className={`chat-message${message.hiddenAt ? ' chat-message--hidden' : ''}${mentionsMe ? ' chat-message--mention' : ''}`}
    >
      <div className="chat-message__meta">
        <NameMenu name={message.author} authorId={message.authorId} />
        {message.isGuest && <span className="chat-badge">Guest</span>}
        <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
        {message.hiddenAt && <em>hidden by {message.hiddenBy}</em>}
      </div>
      {message.body && (
        <p className="chat-message__text">
          <MessageText
            body={message.body}
            linkify={!message.isGuest}
            mentions={message.mentions ?? []}
          />
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
