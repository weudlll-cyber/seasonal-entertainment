// ============================================================
// File:        CommunityCard.jsx
// Path:        client/src/pages/CommunityCard.jsx
// Project:     Seasonal Entertainment
// Description: The home page's Community box (docs/DESIGN.md, "Home"): night blue with the people
//              quarter, "● N online" and the newest 3 messages of the public room "general" (name,
//              short text, time), kept live through the chat module's public useRoomGlimpse; "Open
//              the chat" in its head row. When the newest message is more than 24 hours old, only
//              the count and the button (decided 2026-10-21). Text only: an attachment shows as
//              [image], [GIF] or [file].
// ============================================================

import { Link } from 'react-router';
import { QUARTERS } from '../brand/brand.js';
import { useRoomGlimpse } from '../chat/index.js';
import { Wash } from './homeCards.jsx';

const DAY_MS = 24 * 60 * 60_000;
const SHORT = 80; // characters of a message's text

// An attachment as a word: stickers and pictures [image], GIFs [GIF], other files [file].
function attachmentWord(message) {
  if (message.kind === 'gif') return '[GIF]';
  if (message.kind === 'sticker' || message.file?.kind === 'image') return '[image]';
  return message.file ? '[file]' : '';
}

// What the box shows of a message: its text, shortened, and its attachment as a word.
export function glimpseText(message) {
  const text = message.body.length > SHORT ? `${message.body.slice(0, SHORT - 1)}…` : message.body;
  return [text, attachmentWord(message)].filter(Boolean).join(' ');
}

const time = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// now: injectable for tests (the 24-hour rule).
export default function CommunityCard({ now = Date.now }) {
  const { loaded, online, messages } = useRoomGlimpse();
  const newest = messages.at(-1);
  const recent = newest && now() - Date.parse(newest.createdAt) <= DAY_MS;

  return (
    <section className="home__card home__community" aria-label="Community">
      <Wash src={QUARTERS.chat} />
      {/* The button in the head row: the messages below keep the box's height for themselves. */}
      <div className="home__card-head">
        <h2>Community</h2>
        {loaded && <span className="home__online">● {online} online</span>}
        <Link className="button home__on-navy" to="/chat">
          Open the chat
        </Link>
      </div>
      {/* Older than a day: only the count and the button. */}
      {recent && (
        <ul className="home__messages" aria-label="Newest messages in General">
          {messages.map((m) => (
            <li key={m.id}>
              <span className="home__initial" aria-hidden="true">
                {m.author.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{m.author}</strong> <span className="home__said">{glimpseText(m)}</span>
              </span>
              <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
