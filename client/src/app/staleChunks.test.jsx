// ============================================================
// File:        staleChunks.test.jsx
// Path:        client/src/app/staleChunks.test.jsx
// Project:     Seasonal Entertainment
// Description: A page part whose file is gone after an update (staleChunks.js, LazyBoundary):
//              the page reloads once and shows nothing meanwhile; failing again within a
//              minute of that reload, or with storage blocked, it shows the error with a Reload
//              button instead of a blank page; another page clears the error. Vite's
//              vite:preloadError is handled the same way.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LazyBoundary from './LazyBoundary.jsx';

const MARKER = 'se.reloadedForUpdate';
const ERROR_TEXT = 'This part of the page could not be loaded.';
let reload;
let stale;
let removeListener;

beforeEach(async () => {
  sessionStorage.clear();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  // A fresh module each test: "a reload is under way" is module state.
  vi.resetModules();
  stale = await import('./staleChunks.js');
});
afterEach(() => {
  removeListener?.();
  removeListener = null;
  vi.restoreAllMocks();
});

// reloadOnPreloadError() of this test's module; its listener is removed after the test, so an
// earlier test's module (with its reload under way) cannot answer a later test's event.
function listenForPreloadErrors() {
  const added = vi.spyOn(window, 'addEventListener');
  stale.reloadOnPreloadError();
  const [type, listener] = added.mock.calls[0];
  removeListener = () => window.removeEventListener(type, listener);
}

const gone = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

// A lazily loaded part inside the boundary, as Layout renders the routed page.
function renderPart(load, resetKey = '/a') {
  const Part = stale.lazyPage(load);
  return render(
    <LazyBoundary resetKey={resetKey}>
      <Part />
    </LazyBoundary>
  );
}

it('a part whose file is gone reloads the page once and shows nothing meanwhile', async () => {
  renderPart(gone);
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(Number(sessionStorage.getItem(MARKER))).toBeGreaterThan(Date.now() - 5000);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('failing again right after that reload: the error with a Reload button', async () => {
  sessionStorage.setItem(MARKER, String(Date.now() - 2000));
  renderPart(gone);
  expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXT);
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(reload).toHaveBeenCalledOnce();
});

it('a reload more than a minute ago counts as a new update', async () => {
  sessionStorage.setItem(MARKER, String(Date.now() - 61_000));
  renderPart(gone);
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
});

it('storage blocked: no reload (a loop could not be ruled out), the error shows', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  renderPart(gone);
  expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXT);
  expect(reload).not.toHaveBeenCalled();
});

it('a part that loads is shown; another page clears an error', async () => {
  sessionStorage.setItem(MARKER, String(Date.now()));
  const { rerender } = renderPart(gone, '/a');
  await screen.findByRole('alert');
  const Fine = stale.lazyPage(async () => ({ default: () => <p>Fine page</p> }));
  rerender(
    <LazyBoundary resetKey="/b">
      <Fine />
    </LazyBoundary>
  );
  expect(await screen.findByText('Fine page')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it("vite:preloadError reloads once and keeps Vite from throwing; again soon, it doesn't", () => {
  listenForPreloadErrors();
  const fire = () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(fire()).toBe(true);
  // A second failing file while the reload is under way: still waiting for it.
  expect(fire()).toBe(true);
  expect(reload).toHaveBeenCalledOnce();
  expect(stale.reloadForUpdate()).toBe(true);
  expect(reload).toHaveBeenCalledOnce();
});

it('after the reload (a new page), a failure within the minute is not prevented', async () => {
  sessionStorage.setItem(MARKER, String(Date.now() - 1000));
  listenForPreloadErrors();
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
