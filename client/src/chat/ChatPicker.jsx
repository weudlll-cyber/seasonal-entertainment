// ============================================================
// File:        ChatPicker.jsx
// Path:        client/src/chat/ChatPicker.jsx
// Project:     Seasonal Entertainment
// Description: The picker next to the chat message field: tabs Emoji | Stickers | GIFs. Emojis
//              go into the text at the cursor; a sticker or GIF is sent at once. Stickers and
//              GIFs are for members only (decided 2026-10-17): guests see only Emoji and a hint.
//              The library (active packs in order) loads the first time a media tab opens.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import ChatNotice from './ChatNotice.jsx';
import { EMOJI_GROUPS } from './emojis.js';

const TABS = [
  ['emoji', 'Emoji'],
  ['sticker', 'Stickers'],
  ['gif', 'GIFs'],
];

function EmojiTab({ onEmoji }) {
  return EMOJI_GROUPS.map(([group, emojis]) => (
    <section key={group} className="chat-picker__group" aria-label={group}>
      <h3 className="chat-picker__heading">{group}</h3>
      <div className="chat-picker__grid">
        {emojis.map(([emoji, name]) => (
          <button
            key={emoji}
            type="button"
            className="chat-picker__emoji"
            aria-label={name}
            title={name}
            onClick={() => onEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </section>
  ));
}

// Each pack of this kind is one section; the image's alt text names its button.
function MediaTab({ packs, kind, onMedia }) {
  const shown = packs.filter((pack) => pack.kind === kind);
  if (shown.length === 0) return <p className="chat-note">Nothing here yet.</p>;
  return shown.map((pack) => (
    <section key={pack.id} className="chat-picker__group" aria-label={pack.name}>
      <h3 className="chat-picker__heading">{pack.name}</h3>
      <div className={`chat-picker__grid chat-picker__grid--${kind}`}>
        {pack.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chat-picker__media"
            title={item.credit ? `${item.name} (credit: ${item.credit})` : item.name}
            onClick={() => onMedia(kind, item)}
          >
            <img src={item.url} alt={item.alt} loading="lazy" />
          </button>
        ))}
      </div>
    </section>
  ));
}

// member: signed in (may send stickers and GIFs). onMedia(kind, item) sends one.
export default function ChatPicker({ member, onEmoji, onMedia }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('emoji');
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState(null);
  const tabs = member ? TABS : TABS.slice(0, 1);

  useEffect(() => {
    if (!open || tab === 'emoji' || packs) return;
    api('/chat/media')
      .then((data) => setPacks(data.packs))
      .catch((err) => setError(err.message));
  }, [open, tab, packs]);

  function chooseMedia(kind, item) {
    setOpen(false);
    onMedia(kind, item);
  }

  return (
    <div className="chat-picker">
      <button
        type="button"
        className="chat-button chat-button--secondary"
        aria-expanded={open}
        aria-controls="chat-picker-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {member ? 'Emoji, stickers, GIFs' : 'Emoji'}
      </button>
      {open && (
        <div id="chat-picker-panel" className="chat-picker__panel">
          <div role="tablist" aria-label="Picker" className="chat-picker__tabs">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="chat-picker__tab"
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {!member && <p className="chat-note">Log in to send stickers and GIFs.</p>}
          <div role="tabpanel" aria-label={tabs.find(([key]) => key === tab)[1]}>
            <ChatNotice error={error} />
            {tab === 'emoji' ? (
              <EmojiTab onEmoji={onEmoji} />
            ) : (
              packs && <MediaTab packs={packs} kind={tab} onMedia={chooseMedia} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
