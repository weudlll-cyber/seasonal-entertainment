// ============================================================
// File:        theme.js
// Path:        client/src/theme/theme.js
// Project:     Seasonal Entertainment
// Description: Which theme the site shows: a stored choice ("light" / "dark") wins; without
//              one, the system setting (prefers-color-scheme), followed live. The first paint
//              is done by public/theme-init.js with the same rule (a test keeps both in step).
// ============================================================

import { readStored, writeStored } from '../app/storage.js';

export const THEME_KEY = 'se.theme';
export const THEMES = ['light', 'dark'];
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function storedTheme() {
  const value = readStored(THEME_KEY);
  return THEMES.includes(value) ? value : null;
}

export function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export const resolveTheme = () => storedTheme() ?? systemTheme();

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// The toggle's choice is stored and from then on wins over the system setting.
export function storeTheme(theme) {
  writeStored(THEME_KEY, theme);
}

// Calls onChange(theme) when the system setting changes while no choice is stored.
// Returns the function that stops listening.
export function watchSystemTheme(onChange) {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const listener = () => {
    if (!storedTheme()) onChange(systemTheme());
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
