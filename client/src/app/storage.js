// ============================================================
// File:        storage.js
// Path:        client/src/app/storage.js
// Project:     Seasonal Entertainment
// Description: Per-browser memory that never throws: storage can be blocked (privacy
//              settings, some embedded views) or full. Then nothing is remembered and the site
//              works as on a first visit. Used for the theme and the chat drawer.
// ============================================================

export function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// null removes the entry.
export function writeStored(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Blocked or full: this choice is simply not remembered.
  }
}
