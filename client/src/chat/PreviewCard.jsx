// ============================================================
// File:        PreviewCard.jsx
// Path:        client/src/chat/PreviewCard.jsx
// Project:     Seasonal Entertainment
// Description: The compact link preview under a chat message: image (in a room fetched and
//              stored by the server, so it loads from this site; in a direct message inline
//              data inside the encrypted message), site name, title as the link, description.
//              All text arrives as plain text and is rendered as text, never as HTML.
// ============================================================

export default function PreviewCard({ preview }) {
  const site = preview.siteName ?? new URL(preview.url).hostname;
  return (
    <aside className="chat-preview" aria-label={`Link preview: ${preview.title ?? site}`}>
      {preview.image && (
        <img
          className="chat-preview__image"
          src={preview.image.url}
          alt={`Image from ${site}`}
          width={preview.image.width}
          height={preview.image.height}
          loading="lazy"
        />
      )}
      <div className="chat-preview__text">
        <p className="chat-preview__site">{site}</p>
        <a
          className="chat-preview__title"
          href={preview.url}
          target="_blank"
          rel="nofollow noopener noreferrer ugc"
        >
          {preview.title ?? preview.url}
        </a>
        {preview.description && <p className="chat-preview__description">{preview.description}</p>}
      </div>
    </aside>
  );
}
