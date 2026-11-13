// ============================================================
// File:        useOpenSections.js
// Path:        client/src/components/useOpenSections.js
// Project:     Seasonal Entertainment
// Description: Which collapsible sections (Disclosure.jsx) are open, several at once. The
//              member's own opening and closing is remembered in this browser under storageKey
//              (localStorage through app/storage.js, so blocked storage only means nothing is
//              remembered); reveal(id) opens one for a deep link or a notice that needs it,
//              without remembering that; openFirst lists those already known on the first render,
//              so they never show closed for a moment. Returns { isOpen(id), toggle(id, open),
//              reveal(id) }.
// ============================================================

import { useCallback, useState } from 'react';
import { readStored, writeStored } from '../app/storage.js';

function remembered(storageKey) {
  try {
    const ids = JSON.parse(readStored(storageKey));
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return []; // nothing stored yet, or not JSON
  }
}

export function useOpenSections(storageKey, openFirst = []) {
  const [open, setOpen] = useState(() => new Set([...remembered(storageKey), ...openFirst]));

  const toggle = useCallback(
    (id, next) => {
      setOpen((current) => {
        const changed = new Set(current);
        if (next) changed.add(id);
        else changed.delete(id);
        return changed;
      });
      // Only this click changes what is remembered: a section a link opened stays unremembered.
      const kept = new Set(remembered(storageKey));
      if (next) kept.add(id);
      else kept.delete(id);
      writeStored(storageKey, kept.size ? JSON.stringify([...kept]) : null);
    },
    [storageKey]
  );

  const reveal = useCallback(
    (id) => setOpen((current) => (current.has(id) ? current : new Set(current).add(id))),
    []
  );

  return { isOpen: (id) => open.has(id), toggle, reveal };
}
