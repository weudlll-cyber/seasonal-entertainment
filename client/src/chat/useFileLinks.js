// ============================================================
// File:        useFileLinks.js
// Path:        client/src/chat/useFileLinks.js
// Project:     Seasonal Entertainment
// Description: An uploaded file's addresses as this page may load them. On this site they are
//              the file's own (the cookie goes along). In the chat embedded on another site a
//              member's image or download cannot carry the embed token, so, while the site
//              allows uploads there, the file's short-lived links are asked for once (POST
//              /api/chat/files/:id/links, docs/EMBED.md) and used instead.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { embedToken, embedUploads } from '../embed/embedAuth.js';

// Only a room upload, served by this site's file route, has links; a direct message's file is
// a local object URL of the decrypted bytes and needs none.
const fromFileRoute = (file) =>
  String(file.thumbUrl ?? file.downloadUrl ?? '').startsWith('/api/chat/files/');

// file: { id, thumbUrl?, url?, downloadUrl?, removed? } as a message or an upload carries it.
// Returns the file with the addresses to use, or null while its links are on their way.
export function useFileLinks(file) {
  const linked = Boolean(embedToken()) && embedUploads() && !file.removed && fromFileRoute(file);
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (!linked) return undefined;
    let current = true;
    api(`/chat/files/${file.id}/links`, { method: 'POST' })
      .then((data) => current && setLinks(data.links))
      .catch(() => {}); // no links: the file shows as it did before (not loaded)
    return () => {
      current = false;
    };
  }, [linked, file.id]);
  if (!linked) return file;
  return links && { ...file, ...links };
}
