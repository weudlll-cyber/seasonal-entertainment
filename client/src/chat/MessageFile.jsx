// ============================================================
// File:        MessageFile.jsx
// Path:        client/src/chat/MessageFile.jsx
// Project:     Seasonal Entertainment
// Description: A file sent with a chat message: an image as its thumbnail, opening the full
//              image (metadata removed) on a click; a PDF as a card with name, size and a
//              download link (the site never shows PDFs itself); "File removed" after a
//              moderator took it away.
// ============================================================

import { fileSize } from './fileSize.js';

export default function MessageFile({ file }) {
  if (file.removed) return <p className="chat-message__removed">File removed</p>;
  if (file.kind === 'image') {
    return (
      <a className="chat-file chat-file--image" href={file.url} target="_blank" rel="noopener">
        <img src={file.thumbUrl} alt={`Picture: ${file.name}`} loading="lazy" />
      </a>
    );
  }
  return (
    <div className="chat-file chat-file--pdf" role="group" aria-label={`PDF: ${file.name}`}>
      <span className="chat-file__name">{file.name}</span>
      <span className="chat-file__size">PDF, {fileSize(file.bytes)}</span>
      <a className="chat-link-button" href={file.downloadUrl} download={file.name}>
        Download
      </a>
    </div>
  );
}
