// ============================================================
// File:        MessageParts.jsx
// Path:        client/src/chat/MessageParts.jsx
// Project:     Seasonal Entertainment
// Description: Parts of a message shared by room and direct messages: the text as plain text
//              (members' https links become links; guests' never; in the site's own messages,
//              the weekly recap, paths on this site become links within it; an @mention of a member
//              becomes a name chip that opens the name menu) and a sticker or GIF from the
//              site's library ("Media removed" once it is gone), with its credit.
// ============================================================

import { useState } from 'react';
import { splitLinks, splitMentions } from '@seasonal-entertainment/shared/chatRules.js';
import NameMenu from './NameMenu.jsx';

// Plain text with the mentions the server resolved ({ id, username }) as name chips; an
// "@name" that is not one of them stays text. Everything is text to React: nothing in a
// message is ever HTML.
function TextWithMentions({ text, mentions }) {
  if (!mentions.length) return text;
  return splitMentions(text).map((part, i) => {
    const member =
      part.mention && mentions.find((m) => m.username.toLowerCase() === part.mention.toLowerCase());
    if (!member) return part.text ?? `@${part.mention}`;
    return (
      <span key={i} className="chat-mention">
        <NameMenu name={`@${member.username}`} authorId={member.id} />
      </span>
    );
  });
}

// A path on this site ("/calls/12", "/info/disclaimer") standing alone between spaces.
const SITE_PATH = /(?<=^|\s)(\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)(?=$|\s|[.,;:)])/g;

// The site's own messages (the weekly recap): their site paths become links inside the site.
// Only for those: a member's text never gets links it did not write as https. Plain links: the
// chat module stays free of the app's routing (chatModule.test.js), so a click loads the page.
function TextWithSitePaths({ text }) {
  return text.split(SITE_PATH).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part}>
        {part}
      </a>
    ) : (
      part
    )
  );
}

// sitePaths: the site's own message (isSystem); linkify: a member's (https links).
export function MessageText({ body, linkify, sitePaths = false, mentions = [] }) {
  if (sitePaths) return <TextWithSitePaths text={body} />;
  if (!linkify) return <TextWithMentions text={body} mentions={mentions} />;
  return splitLinks(body).map((part, i) =>
    part.link ? (
      <a key={i} href={part.link} target="_blank" rel="nofollow noopener noreferrer ugc">
        {part.link}
      </a>
    ) : (
      <span key={i}>
        <TextWithMentions text={part.text} mentions={mentions} />
      </span>
    )
  );
}

// A sticker (fixed size) or GIF (at most 240 px wide). A credit shows on hover (title) and,
// for touch screens, on a tap.
export function MessageMedia({ kind, media }) {
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
