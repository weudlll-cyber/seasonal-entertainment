// ============================================================
// File:        updateNotice.test.jsx
// Path:        client/src/app/updateNotice.test.jsx
// Project:     Seasonal Entertainment
// Description: The "new version" notice (UpdateNotice.jsx): with fake timers and a mocked
//              /api/health it asks once per CHECK_MS and when the chat connection is back after
//              a drop, shows the notice with a Reload button only for another known commit,
//              never asks without a build commit or while the tab is hidden, and stops asking
//              once it shows.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRoom } from '../chat/connection.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi } from '../test/mockApi.js';
import UpdateNotice, { CHECK_MS } from './UpdateNotice.jsx';

const BUILT = 'aaaaaaaaaaaa';
const health = (commit) => ({ 'GET /health': { body: { ok: true, version: '0.1.0', commit } } });
const TEXT = 'A new version of this site is available.';

// Lets the interval fire and the answer arrive.
const wait = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));
const notice = () => screen.queryByRole('status');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  // Back to visible for the next test (a test may hide the tab).
  delete document.visibilityState;
});

describe('UpdateNotice', () => {
  it('another commit: the notice with a Reload button, and no more asking', async () => {
    const calls = mockApi(health('bbbbbbbbbbbb'));
    render(<UpdateNotice buildCommit={BUILT} />);
    await wait(CHECK_MS - 1);
    expect(calls).toHaveLength(0); // nothing before the first interval
    expect(notice()).toBeNull();
    await wait(1);
    expect(calls).toHaveLength(1);
    expect(notice()).toHaveTextContent(TEXT);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled();
    await wait(3 * CHECK_MS);
    expect(calls).toHaveLength(1);
  });

  it('the same commit: one small request per interval, no notice', async () => {
    const calls = mockApi(health(BUILT));
    render(<UpdateNotice buildCommit={BUILT} />);
    await wait(3 * CHECK_MS);
    expect(calls.map((call) => call.key)).toEqual(['GET /health', 'GET /health', 'GET /health']);
    expect(notice()).toBeNull();
  });

  it('no build commit (the dev server) or "unknown": never asks', async () => {
    const calls = mockApi(health('bbbbbbbbbbbb'));
    const { rerender } = render(<UpdateNotice buildCommit="" />);
    await wait(2 * CHECK_MS);
    rerender(<UpdateNotice buildCommit="unknown" />);
    await wait(2 * CHECK_MS);
    expect(calls).toHaveLength(0);
    expect(notice()).toBeNull();
  });

  it('a server without a known commit, or one that is down, shows nothing', async () => {
    let answer = { body: { ok: true, commit: 'unknown' } };
    mockApi({ 'GET /health': () => answer });
    render(<UpdateNotice buildCommit={BUILT} />);
    await wait(CHECK_MS);
    expect(notice()).toBeNull();
    answer = { status: 502, body: {} };
    await wait(CHECK_MS);
    expect(notice()).toBeNull();
    // Back, updated: the next check finds it.
    answer = health('bbbbbbbbbbbb')['GET /health'];
    await wait(CHECK_MS);
    expect(notice()).toHaveTextContent(TEXT);
  });

  it('a hidden tab does not ask', async () => {
    const calls = mockApi(health('bbbbbbbbbbbb'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    render(<UpdateNotice buildCommit={BUILT} />);
    await wait(3 * CHECK_MS);
    expect(calls).toHaveLength(0);
    delete document.visibilityState;
    await wait(CHECK_MS);
    expect(calls).toHaveLength(1);
    expect(notice()).toHaveTextContent(TEXT);
  });
});

describe('UpdateNotice and the chat connection', () => {
  let leave;
  beforeEach(() => {
    FakeSocket.reset();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    act(() => leave?.());
    act(() => vi.runOnlyPendingTimers());
  });

  it('asks as soon as the connection is back after a drop, not on the first open', async () => {
    const calls = mockApi(health('bbbbbbbbbbbb'));
    render(<UpdateNotice buildCommit={BUILT} />);
    leave = joinRoom('general', () => {});
    await wait(1); // the first open
    expect(calls).toHaveLength(0);
    FakeSocket.all[0].closeByServer(1006); // the site restarts for the update
    await wait(3000 + 1); // the reconnect, well before CHECK_MS
    expect(FakeSocket.all).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(notice()).toHaveTextContent(TEXT);
  });
});

it('Reload reloads the page', async () => {
  mockApi(health('bbbbbbbbbbbb'));
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  render(<UpdateNotice buildCommit={BUILT} />);
  await wait(CHECK_MS);
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(reload).toHaveBeenCalledOnce();
});
