// ============================================================
// File:        ComposerAttachment.jsx
// Path:        client/src/chat/ComposerAttachment.jsx
// Project:     Seasonal Entertainment
// Description: The one attachment of the message being written, shown small above the message
//              field with an × to take it off again. It is sent together with the text.
// ============================================================

// attachment: { type: 'sticker' | 'gif', item: { url, alt, name } }.
export default function ComposerAttachment({ attachment, onRemove }) {
  const { item } = attachment;
  return (
    <div className="chat-attachment" role="group" aria-label="Attachment">
      <img className="chat-attachment__image" src={item.url} alt={item.alt} />
      <button
        type="button"
        className="chat-attachment__remove"
        aria-label={`Remove attachment ${item.name}`}
        title="Remove attachment"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
