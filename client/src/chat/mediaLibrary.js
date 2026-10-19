// ============================================================
// File:        mediaLibrary.js
// Path:        client/src/chat/mediaLibrary.js
// Project:     Seasonal Entertainment
// Description: The site's sticker/GIF library (GET /api/chat/media: the active packs in
//              order), loaded once per page and shared by everything that needs it: the
//              picker's Stickers and GIFs tabs and the direct-message view (which shows
//              stickers by library id). A failed load is forgotten, so the next use tries again.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';

let library = null; // the one request's promise of the packs

function loadLibrary() {
  library ??= api('/chat/media')
    .then((data) => data.packs)
    .catch((error) => {
      library = null;
      throw error;
    });
  return library;
}

// wanted: load now (a tab opened, a message uses an item). Returns { packs, error }; packs
// is null until loaded.
export function useMediaLibrary(wanted) {
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!wanted || packs) return undefined;
    let current = true; // an answer after unmounting is dropped
    loadLibrary().then(
      (loaded) => current && setPacks(loaded),
      (err) => current && setError(err.message)
    );
    return () => {
      current = false;
    };
  }, [wanted, packs]);
  return { packs, error };
}

// Every item by its id, with its pack's kind ('sticker' or 'gif').
export function itemsById(packs) {
  const byId = new Map();
  for (const pack of packs) {
    for (const item of pack.items) byId.set(item.id, { ...item, kind: pack.kind });
  }
  return byId;
}
