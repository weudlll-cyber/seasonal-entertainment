// ============================================================
// File:        theme.test.jsx
// Path:        client/src/theme/theme.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the theme rule: a stored choice wins, else the system setting, followed
//              live while nothing is stored; the toggle stores its choice; blocked storage
//              still gives a working page; and public/theme-init.js (first paint) agrees with
//              src/theme/theme.js in every case.
// ============================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, resolveTheme } from './theme.js';
import { ThemeProvider } from './ThemeContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

// A system setting the test can flip, like a real media query list.
let systemDark = false;
const listeners = new Set();
function flipSystem(dark) {
  systemDark = dark;
  act(() => listeners.forEach((listener) => listener()));
}

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }));
});
afterEach(() => vi.restoreAllMocks());

const htmlTheme = () => document.documentElement.dataset.theme;
const showToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );

describe('which theme', () => {
  it('a stored choice wins over the system setting; an invalid one is ignored', () => {
    systemDark = false;
    localStorage.setItem(THEME_KEY, 'dark');
    expect(resolveTheme()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'purple');
    expect(resolveTheme()).toBe('light');
  });

  it('without a stored choice: the system setting, followed live', () => {
    systemDark = true;
    showToggle();
    expect(htmlTheme()).toBe('dark');
    flipSystem(false);
    expect(htmlTheme()).toBe('light');
  });

  it('the toggle stores its choice, which then ignores system changes', () => {
    showToggle();
    expect(htmlTheme()).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(htmlTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    flipSystem(false);
    expect(htmlTheme()).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('blocked storage: the system theme, and the toggle still works for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    systemDark = true;
    showToggle();
    expect(htmlTheme()).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(htmlTheme()).toBe('light');
  });
});

describe('public/theme-init.js (first paint)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(path.join(here, '..', '..', 'public', 'theme-init.js'), 'utf8');
  const runFirstPaint = () => new Function(script)();

  it.each([
    ['stored dark, system light', 'dark', false],
    ['stored light, system dark', 'light', true],
    ['nothing stored, system dark', null, true],
    ['nothing stored, system light', null, false],
    ['invalid stored, system dark', 'blue', true],
  ])('agrees with theme.js: %s', (_case, stored, dark) => {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    systemDark = dark;
    runFirstPaint();
    expect(htmlTheme()).toBe(resolveTheme());
  });

  it('blocked storage: the system theme, no error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    systemDark = true;
    expect(runFirstPaint).not.toThrow();
    expect(htmlTheme()).toBe('dark');
  });
});
