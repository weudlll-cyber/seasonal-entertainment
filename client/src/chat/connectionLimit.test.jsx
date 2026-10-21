// ============================================================
// File:        connectionLimit.test.jsx
// Path:        client/src/chat/connectionLimit.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the page's reaction when the server closes its live connection as one
//              too many (connection.js, ConnectionLimitNotice.jsx): the chat area says so in
//              English, no retry loop follows, and it tries again when the reader presses "Try
//              again" or another tab of this browser closes its connection.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import ConnectionLimitNotice from './ConnectionLimitNotice.jsx';
import { joinRoom, TOO_MANY_CONNECTIONS } from './connection.js';

const TEXT = 'You have the chat open in too many windows (at most 5). Close one and try again.';
let leave;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.useFakeTimers();
});
// The page's one connection is module state: each test leaves it closed for the next.
afterEach(async () => {
  act(() => leave?.());
  if (vi.isFakeTimers()) act(() => vi.runOnlyPendingTimers());
  else await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  vi.useRealTimers();
});

function refusedPage() {
  render(<ConnectionLimitNotice />);
  leave = joinRoom('general', () => {});
  act(() => vi.advanceTimersByTime(1)); // the socket opens
  FakeSocket.all[0].closeByServer(TOO_MANY_CONNECTIONS);
}

it('says so in the chat area and does not retry in a loop; "Try again" does', () => {
  refusedPage();
  expect(screen.getByRole('alert')).toHaveTextContent(TEXT);
  act(() => vi.advanceTimersByTime(60_000));
  expect(FakeSocket.all).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(FakeSocket.all).toHaveLength(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('tries again when another tab of this browser closes its connection', async () => {
  refusedPage();
  const otherTab = new BroadcastChannel('se-chat');
  otherTab.postMessage('closed');
  otherTab.close();
  vi.useRealTimers(); // the message arrives on the real event loop
  await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
});

it('an ordinary drop still reconnects after a pause', () => {
  render(<ConnectionLimitNotice />);
  leave = joinRoom('general', () => {});
  act(() => vi.advanceTimersByTime(1));
  FakeSocket.all[0].closeByServer(1006);
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => vi.advanceTimersByTime(3000));
  expect(FakeSocket.all).toHaveLength(2);
});
