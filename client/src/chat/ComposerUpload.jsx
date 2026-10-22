// ============================================================
// File:        ComposerUpload.jsx
// Path:        client/src/chat/ComposerUpload.jsx
// Project:     Seasonal Entertainment
// Description: "Attach file" in the composer (members only): JPG, PNG, WebP, GIF or PDF. The
//              file is uploaded at once (the server checks its real type, size and the daily
//              quota) and becomes the message's attachment; it is sent with the message.
// ============================================================

import { useRef, useState } from 'react';
import { upload } from '../api/http.js';
import Icon from '../app/icons.jsx';
import ChatNotice from './ChatNotice.jsx';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

const roomUpload = async (file) =>
  (await upload('/chat/uploads', file, { name: file.name })).upload;

// onUploaded(upload): the stored file ({ id, kind, name, bytes, thumbUrl? }). send(file):
// how the file is uploaded (a room's upload by default; a direct message encrypts it first,
// directFile.js); accept: the file types offered (any for direct messages).
export default function ComposerUpload({ onUploaded, send = roomUpload, accept = ACCEPT }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be chosen again later
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onUploaded(await send(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-upload">
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        aria-label="File to attach"
        onChange={choose}
      />
      <button
        type="button"
        className="chat-button chat-button--secondary"
        disabled={busy}
        onClick={() => input.current.click()}
      >
        <Icon name="paperclip" size={20} />
        <span className="chat-button__text">{busy ? 'Uploading…' : 'Attach file'}</span>
      </button>
      <ChatNotice error={error} />
    </div>
  );
}
