// ============================================================
// File:        useDirectLinkPreview.js
// Path:        client/src/chat/useDirectLinkPreview.js
// Project:     Seasonal Entertainment
// Description: The link preview of a direct message being written (docs/CHAT.md, "Link
//              previews in direct messages"): the first https link of the draft is sent to the
//              server's preview route (POST /api/chat/direct/preview, which stores and logs
//              nothing), a moment after typing stops; the card then shows in the composer and
//              travels inside the encrypted message. The writer can remove it (no card for that
//              link any more). Off ("Link previews in direct messages" on the account page):
//              no request at all. safePreview() is the receiving side's check of a card.
// ============================================================

import { useEffect, useState } from 'react';
import { firstHttpsLink } from '@seasonal-entertainment/shared/chatRules.js';
import { api } from '../api/http.js';

const WAIT_MS = 600; // after the last keystroke
const IMAGE = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;
const text = (value, max) => (typeof value === 'string' && value ? value.slice(0, max) : null);

// A card as it arrived inside a decrypted message, kept only if it is what the sender's
// browser makes: an https link, plain text, and an image only as inline WebP data — so showing
// it never contacts another site. Anything else: no card (null).
export function safePreview(preview) {
  if (!preview || typeof preview.url !== 'string' || firstHttpsLink(preview.url) !== preview.url)
    return null;
  return {
    url: preview.url,
    title: text(preview.title, 120),
    description: text(preview.description, 300),
    siteName: text(preview.siteName, 60),
    image: typeof preview.image === 'string' && IMAGE.test(preview.image) ? preview.image : null,
  };
}

// draft: the composer's text; enabled: the member's setting. Returns { card, remove } where
// card is the preview to show and send (null when there is none).
export function useDirectLinkPreview(draft, enabled) {
  const url = enabled ? firstHttpsLink(draft) : null;
  const [found, setFound] = useState(null); // { url, preview }
  const [removed, setRemoved] = useState(null); // the link whose card the writer removed

  useEffect(() => {
    if (!url || url === removed) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      api('/chat/direct/preview', { method: 'POST', body: { url } })
        .then((answer) => current && setFound({ url, preview: answer.preview }))
        .catch(() => {}); // no card
    }, WAIT_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [url, removed]);

  const card = url && found?.url === url && url !== removed ? found.preview : null;
  return { card, remove: () => setRemoved(url) };
}
