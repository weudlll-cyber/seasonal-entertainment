// ============================================================
// File:        ThemeContext.jsx
// Path:        client/src/theme/ThemeContext.jsx
// Project:     Seasonal Entertainment
// Description: The current theme for the whole app, so every toggle (sidebar, top bar) shows
//              and changes the same state. Keeps <html data-theme> in step and follows the
//              system setting live while the visitor has not chosen. A page may force a theme
//              for itself without storing it (force; the embedded chat's ?theme=).
// ============================================================

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, resolveTheme, storeTheme, watchSystemTheme } from './theme.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveTheme);
  const [forced, setForced] = useState(null); // 'light' / 'dark' while a page forces one

  useEffect(() => applyTheme(forced ?? theme), [forced, theme]);
  useEffect(() => watchSystemTheme(setTheme), []);

  const value = useMemo(
    () => ({
      theme,
      // force('light' | 'dark') shows that theme until force(null); nothing is stored.
      force: setForced,
      toggle() {
        const next = theme === 'dark' ? 'light' : 'dark';
        storeTheme(next);
        setTheme(next);
      },
    }),
    [theme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
