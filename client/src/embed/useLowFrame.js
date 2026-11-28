// ============================================================
// File:        useLowFrame.js
// Path:        client/src/embed/useLowFrame.js
// Project:     Seasonal Entertainment
// Description: Whether the embedded chat's own frame is too low for its usual layout: under
//              120 px, as in a game's 100 px docked strip (decided 2026-11-28;
//              docs/GAME-INTEGRATION.md section 9, "Placement and sizes"). A media query on the
//              frame, so it follows a resize.
// ============================================================

import { useSyncExternalStore } from 'react';

export const LOW_CHAT_QUERY = '(max-height: 119.98px)';

// Absent in some environments (tests without a stub): then the frame counts as not low.
const media = () => window.matchMedia?.(LOW_CHAT_QUERY);

function subscribe(changed) {
  const query = media();
  query?.addEventListener('change', changed);
  return () => query?.removeEventListener('change', changed);
}

export function useLowFrame() {
  return useSyncExternalStore(subscribe, () => Boolean(media()?.matches));
}
