// ============================================================
// File:        storage.js
// Path:        client/src/app/storage.js
// Project:     Seasonal Entertainment
// Description: Per-browser memory that never throws: storage can be blocked (privacy
//              settings, some embedded views) or full. Then nothing is remembered and the site
//              works as on a first visit. Used for the theme and the chat drawer
//              (localStorage), a push turn-on still finishing and its failure
//              (notify/pushPending.js, localStorage), the account page's open sections
//              (components/useOpenSections.js, localStorage), and for the one reload after an
//              update (sessionStorage, this tab only; staleChunks.js).
// ============================================================

// `area` is 'localStorage' or 'sessionStorage'; reading window[area] can itself throw.
export function readStored(key, area = 'localStorage') {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
}

// null removes the entry.
export function writeStored(key, value, area = 'localStorage') {
  try {
    if (value === null) window[area].removeItem(key);
    else window[area].setItem(key, value);
  } catch {
    // Blocked or full: this choice is simply not remembered.
  }
}
