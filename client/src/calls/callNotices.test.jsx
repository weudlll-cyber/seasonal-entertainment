// ============================================================
// File:        callNotices.test.jsx
// Path:        client/src/calls/callNotices.test.jsx
// Project:     Seasonal Entertainment
// Description: The notices of "Remind me on this site" (CallNotices.jsx): a member's page
//              shows "<title> starts in 10 minutes" and "<title> is live now" when the server
//              pushes them, with Listen and Dismiss; each kind once — dismissed in one tab it
//              goes in the others and does not come back; none on the call's own page; guests
//              never get one.
// ============================================================

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const MIA = { id: 4, username: 'mia', role: 'member' };
const CALL = { id: 3, title: 'Town hall', scheduledFor: null };
const reminder = (kind) => ({ type: 'callReminder', kind, call: CALL });
const DATA = {
  'GET /games': { body: { ok: true, games: [] } },
  'GET /calls/summary': { body: { ok: true, configured: true, live: false } },
};

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  localStorage.clear();
});

// The page's one live connection, once it is open.
async function socket() {
  await vi.waitFor(() => expect(FakeSocket.all.length).toBeGreaterThan(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return FakeSocket.all.at(-1);
}

describe('call notices', () => {
  it('shows "soon" and "live" to a member, each with Listen and Dismiss', async () => {
    mockApi({ ...signedIn(MIA), ...DATA });
    await renderApp('/games');
    const live = await socket();
    live.push(reminder('soon'));
    expect(await screen.findByText('Town hall starts in 10 minutes')).toBeInTheDocument();
    live.push(reminder('live'));
    expect(screen.getByText('Town hall is live now')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Listen' })[0]).toHaveAttribute('href', '/calls/3');
  });

  it('once per kind: dismissed here, gone in other tabs and not shown again', async () => {
    mockApi({ ...signedIn(MIA), ...DATA });
    await renderApp('/games');
    const live = await socket();
    live.push(reminder('live'));
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Town hall is live now')).toBeNull();
    live.push(reminder('live')); // e.g. a second tab's copy of the same push
    expect(screen.queryByText('Town hall is live now')).toBeNull();

    // Another tab dismissed "soon": this tab hears the storage change.
    live.push(reminder('soon'));
    expect(screen.getByText('Town hall starts in 10 minutes')).toBeInTheDocument();
    act(() => {
      localStorage.setItem('se.callNotice.3.soon', '1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'se.callNotice.3.soon' }));
    });
    expect(screen.queryByText('Town hall starts in 10 minutes')).toBeNull();
  });

  it("is not shown on the call's own page", async () => {
    mockApi({
      ...signedIn(MIA),
      ...DATA,
      'GET /calls/3': { status: 404, body: { ok: false, message: 'No such call.' } },
      'GET /chat/glimpse': { body: { ok: true, online: 0, room: 'general', messages: [] } },
    });
    await renderApp('/calls/3');
    const live = await socket();
    live.push(reminder('live'));
    expect(screen.queryByText('Town hall is live now')).toBeNull();
    // Nor later, after leaving it: the member was there when it came.
    fireEvent.click(screen.getByRole('link', { name: 'Seasonal Entertainment, home' }));
    await screen.findByRole('heading', { level: 1, name: /Welcome/ });
    expect(screen.queryByText('Town hall is live now')).toBeNull();
  });

  it('guests never get one', async () => {
    mockApi({
      ...GUEST,
      ...DATA,
      'GET /chat/glimpse': { body: { ok: true, online: 0, room: 'general', messages: [] } },
    });
    await renderApp('/');
    const live = await socket();
    live.push(reminder('live'));
    expect(screen.queryByText('Town hall is live now')).toBeNull();
  });
});
