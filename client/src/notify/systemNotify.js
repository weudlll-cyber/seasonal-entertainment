// ============================================================
// File:        systemNotify.js
// Path:        client/src/notify/systemNotify.js
// Project:     Seasonal Entertainment
// Description: Browser notifications while the site is open (docs/CHAT.md, "Notifications",
//              decided 2026-10-22): whether the browser offers them, asking for permission
//              (only ever from a button the member pressed), whether any tab of the site is
//              visible right now (each tab notes its own visibility in browser storage, renewed
//              while visible, so a closed tab's note fades), and showing one notification per
//              event across tabs (the first tab to claim the event shows it, like the call
//              notices; the tag also lets the browser replace a double). No web push: with no
//              tab of the site open, there are none.
// ============================================================

import { readStored, writeStored } from '../app/storage.js';

const VISIBLE_PREFIX = 'se.visibleTab.';
const CLAIM_PREFIX = 'se.notified.';
const BEAT_MS = 5000;
const FRESH_MS = 15_000; // a visibility note older than this is a closed or frozen tab's
const tabId = Math.random().toString(36).slice(2);

export const notificationsSupported = () => typeof Notification === 'function';
export const permission = () => (notificationsSupported() ? Notification.permission : 'denied');

// Only call from a click: browsers refuse (and remember) prompts nobody asked for.
export async function askPermission() {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

// This tab's own note, kept while it is visible.
function noteVisibility() {
  writeStored(
    `${VISIBLE_PREFIX}${tabId}`,
    document.visibilityState === 'visible' ? String(Date.now()) : null
  );
}

// Starts noting this tab's visibility; returns the function that stops it.
export function trackVisibility() {
  noteVisibility();
  const beat = setInterval(noteVisibility, BEAT_MS);
  const gone = () => writeStored(`${VISIBLE_PREFIX}${tabId}`, null);
  document.addEventListener('visibilitychange', noteVisibility);
  window.addEventListener('pagehide', gone);
  return () => {
    clearInterval(beat);
    document.removeEventListener('visibilitychange', noteVisibility);
    window.removeEventListener('pagehide', gone);
    gone();
  };
}

// Is any tab of the site visible at this moment (this one or another)?
export function anyTabVisible() {
  if (document.visibilityState === 'visible') return true;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(VISIBLE_PREFIX)) continue;
      if (Date.now() - Number(readStored(key)) < FRESH_MS) return true;
    }
  } catch {
    // Storage blocked: only this tab is known, and it is not visible.
  }
  return false;
}

// Shows `body` once per `key` across this browser's tabs; onClick when the member clicks it.
export function notifyOnce(key, body, onClick) {
  if (readStored(`${CLAIM_PREFIX}${key}`)) return null;
  writeStored(`${CLAIM_PREFIX}${key}`, String(Date.now()));
  const shown = new Notification('Seasonal Entertainment', { body, tag: key });
  shown.onclick = () => {
    window.focus();
    onClick();
    shown.close();
  };
  return shown;
}
