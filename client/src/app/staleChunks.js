// ============================================================
// File:        staleChunks.js
// Path:        client/src/app/staleChunks.js
// Project:     Seasonal Entertainment
// Description: A page part loaded on first use (lazyPage, App.jsx) whose file is gone because
//              the site was updated while the page was open: the page reloads once and gets
//              the new files (docs/DEPLOYMENT.md, "Updating"). A reload in this tab within the
//              last minute means reloading did not help: then the load error goes on to
//              LazyBoundary, which shows it with a Reload button instead of a blank page.
//              Vite's vite:preloadError (a page part's files failed to preload; in the build this
//              usually comes first, the import's own error after it) is handled the same way
//              (reloadOnPreloadError, main.jsx).
// ============================================================

import { lazy } from 'react';
import { readStored, writeStored } from './storage.js';

// sessionStorage: this tab only, gone when it closes.
const RELOADED_AT = 'se.reloadedForUpdate';
// A reload that has not fixed it within a minute will not fix it on its own; this also keeps a
// broken site from reloading in a loop.
const RELOAD_WINDOW_MS = 60_000;

// Set once this page has asked for a reload: a second failing part while the reload is under
// way must not count as "reloading did not help".
let reloading = false;

// Reloads the page once for an update; false when that was already tried (or storage is
// blocked, so a loop could not be ruled out) and the error should show instead.
export function reloadForUpdate() {
  if (reloading) return true;
  const last = Number(readStored(RELOADED_AT, 'sessionStorage'));
  if (last && Date.now() - last < RELOAD_WINDOW_MS) return false;
  const now = String(Date.now());
  writeStored(RELOADED_AT, now, 'sessionStorage');
  if (readStored(RELOADED_AT, 'sessionStorage') !== now) return false;
  reloading = true;
  window.location.reload();
  return true;
}

// React.lazy for a page part: while the reload runs, the part stays "loading" (the shell
// stays, nothing flashes); otherwise the error goes on to the nearest LazyBoundary.
export function lazyPage(load) {
  return lazy(() =>
    load().catch((error) => {
      if (reloadForUpdate()) return new Promise(() => {});
      throw error;
    })
  );
}

// Vite's event for a dynamic import whose preloaded files failed. preventDefault() keeps
// Vite from throwing while the page reloads; without a reload the import fails as usual.
export function reloadOnPreloadError() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
}
