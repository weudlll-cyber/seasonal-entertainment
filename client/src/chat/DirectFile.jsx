// ============================================================
// File:        DirectFile.jsx
// Path:        client/src/chat/DirectFile.jsx
// Project:     Seasonal Entertainment
// Description: A file in a received or sent direct message (docs/CHAT.md, "Files in direct
//              messages"): fetched and decrypted in this browser (directFile.js). It is shown
//              as a picture only when its decrypted bytes are a PNG, JPEG, GIF or WebP
//              (rasterType), through an object URL in an img element; anything else — an SVG
//              or HTML file too, whatever its name or stated type — is offered as a download
//              only, never opened by the site.
// ============================================================

import { useEffect, useState } from 'react';
import { downloadBytes, openDirectFile, rasterType } from './directFile.js';
import { fileSize } from './fileSize.js';

// file: the message's { id, key, name, type, bytes }.
export default function DirectFile({ file }) {
  // { bytes, picture (object URL) } once opened; null while opening; false when it failed.
  const [opened, setOpened] = useState(null);

  useEffect(() => {
    let current = true;
    let picture = null;
    openDirectFile(file)
      .then((bytes) => {
        if (!current) return;
        if (!bytes) return setOpened(false);
        const type = rasterType(bytes);
        picture = type && URL.createObjectURL(new Blob([bytes], { type }));
        setOpened({ bytes, picture });
      })
      .catch(() => current && setOpened(false));
    return () => {
      current = false;
      if (picture) URL.revokeObjectURL(picture);
    };
  }, [file]);

  if (opened === false) return <p className="chat-note">This file cannot be opened.</p>;
  if (opened?.picture) {
    return <img className="chat-message__media" src={opened.picture} alt={file.name} />;
  }
  return (
    <p className="chat-attachment__file">
      <button
        type="button"
        className="chat-link-button"
        disabled={!opened}
        onClick={() => downloadBytes(opened.bytes, file.name)}
      >
        Download {file.name}
      </button>{' '}
      ({fileSize(file.bytes)})
    </p>
  );
}
