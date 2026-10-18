// ============================================================
// File:        ComposerAttachment.jsx
// Path:        client/src/chat/ComposerAttachment.jsx
// Project:     Seasonal Entertainment
// Description: The one attachment of the message being written, shown small above the message
//              field with an × to take it off again: a sticker or GIF, an uploaded image
//              (its thumbnail) or a PDF (name and size). It is sent together with the text.
// ============================================================

import { fileSize } from './fileSize.js';

function Preview({ attachment }) {
  if (attachment.type !== 'file') {
    return (
      <img className="chat-attachment__image" src={attachment.item.url} alt={attachment.item.alt} />
    );
  }
  const { upload } = attachment;
  if (upload.kind === 'image') {
    return (
      <img
        className="chat-attachment__image"
        src={upload.thumbUrl}
        alt={`Picture: ${upload.name}`}
      />
    );
  }
  return (
    <p className="chat-attachment__file">
      PDF: {upload.name} ({fileSize(upload.bytes)})
    </p>
  );
}

// attachment: { type: 'sticker' | 'gif', item } or { type: 'file', upload }.
export default function ComposerAttachment({ attachment, onRemove }) {
  const name = attachment.type === 'file' ? attachment.upload.name : attachment.item.name;
  return (
    <div className="chat-attachment" role="group" aria-label="Attachment">
      <Preview attachment={attachment} />
      <button
        type="button"
        className="chat-attachment__remove"
        aria-label={`Remove attachment ${name}`}
        title="Remove attachment"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
