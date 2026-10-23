// ============================================================
// File:        ComposerAttachment.jsx
// Path:        client/src/chat/ComposerAttachment.jsx
// Project:     Seasonal Entertainment
// Description: The one attachment of the message being written, shown small above the message
//              field with an × to take it off again: a sticker or GIF, an uploaded image
//              (its thumbnail) or a PDF or, in a direct message, any other file (name and
//              size). It is sent together with the text. An uploaded image in the chat on
//              another site shows through its short-lived link (useFileLinks.js).
// ============================================================

import { fileSize } from './fileSize.js';
import { useFileLinks } from './useFileLinks.js';

function Preview({ attachment }) {
  if (attachment.type !== 'file') {
    return (
      <img className="chat-attachment__image" src={attachment.item.url} alt={attachment.item.alt} />
    );
  }
  return <FilePreview upload={attachment.upload} />;
}

function FilePreview({ upload: stored }) {
  const upload = useFileLinks(stored) ?? {}; // no address while its link is on its way
  if (stored.kind === 'image') {
    return (
      <img
        className="chat-attachment__image"
        src={upload.thumbUrl}
        alt={`Picture: ${stored.name}`}
      />
    );
  }
  const { kind, name, bytes } = stored;
  return (
    <p className="chat-attachment__file">
      {kind === 'pdf' ? 'PDF' : 'File'}: {name} ({fileSize(bytes)})
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
