// ============================================================
// File:        homeLive.test.jsx
// Path:        client/src/pages/homeLive.test.jsx
// Project:     Seasonal Entertainment
// Description: The home page's live boxes. Community: "● N online" and the newest messages of
//              General as text only ([image], [GIF], [file]), kept live (a new message added, a
//              new count, a hidden message gone), nothing while the server says the room is not
//              public, and only the count and the button when the newest message is more than
//              24 hours old. Next call: a live call with "Listen", else the next planned one with
//              its time and "Add to calendar" (plus "Remind me" for members only), else a
//              friendly line.
// ============================================================

import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import CommunityCard, { glimpseText } from './CommunityCard.jsx';
import NextCallCard from './NextCallCard.jsx';

const NOW = Date.parse('2026-10-21T20:00:00Z');
const message = (id, author, body, extra = {}) => ({
  id,
  author,
  body,
  kind: 'text',
  file: null,
  createdAt: new Date(NOW - (10 - id) * 60_000).toISOString(),
  ...extra,
});

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const inRouter = (node) =>
  render(
    <MemoryRouter>
      <SessionProvider>{node}</SessionProvider>
    </MemoryRouter>
  );

describe('Community box', () => {
  const glimpse = (body) => ({ 'GET /chat/glimpse': { body: { ok: true, ...body } } });
  const shown = () =>
    within(screen.getByRole('list', { name: 'Newest messages in General' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span:nth-child(2)').textContent);

  it('shows the online count and the newest messages as text, kept live', async () => {
    const calls = mockApi({
      ...GUEST,
      ...glimpse({
        online: 4,
        room: 'general',
        messages: [message(1, 'mia', 'Hello'), message(2, 'tom', '', { kind: 'gif' })],
      }),
    });
    inRouter(<CommunityCard now={() => NOW} />);
    expect(await screen.findByText('● 4 online')).toBeInTheDocument();
    expect(shown()).toEqual(['mia Hello', 'tom [GIF]']);
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const live = FakeSocket.all[0];
    expect(live.sent).toContainEqual({ type: 'subscribe', room: 'general' });

    live.push({ type: 'message', room: 'general', message: message(3, 'ann', 'Hi all') });
    live.push({ type: 'message', room: 'general', message: message(4, 'bob', 'Yo') });
    expect(shown()).toEqual(['tom [GIF]', 'ann Hi all', 'bob Yo']);
    live.push({ type: 'online', room: 'general', count: 5 });
    expect(screen.getByText('● 5 online')).toBeInTheDocument();
    // A hidden message: the box asks again and shows what the server says now.
    const asked = calls.filter((c) => c.key === 'GET /chat/glimpse').length;
    live.push({ type: 'hidden', room: 'general', id: 4 });
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /chat/glimpse').length).toBe(asked + 1)
    );
  });

  it('adds nothing while the room is not public (the server answered no room)', async () => {
    mockApi({ ...GUEST, ...glimpse({ online: 1, room: null, messages: [] }) });
    inRouter(<CommunityCard now={() => NOW} />);
    await screen.findByText('● 1 online');
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    FakeSocket.all[0].push({ type: 'message', room: 'general', message: message(9, 'mia', 'x') });
    expect(screen.queryByRole('list', { name: 'Newest messages in General' })).toBeNull();
  });

  it('only the count and the button when the newest message is over 24 hours old', async () => {
    mockApi({
      ...GUEST,
      ...glimpse({ online: 2, room: 'general', messages: [message(1, 'mia', 'Old news')] }),
    });
    inRouter(<CommunityCard now={() => NOW + 25 * 60 * 60_000} />);
    expect(await screen.findByText('● 2 online')).toBeInTheDocument();
    expect(screen.queryByText(/Old news/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the chat' })).toHaveAttribute('href', '/chat');
  });

  it('turns attachments into words', () => {
    const base = message(1, 'mia', 'look');
    expect(glimpseText({ ...base, kind: 'sticker' })).toBe('look [image]');
    expect(glimpseText({ ...base, file: { kind: 'image' } })).toBe('look [image]');
    expect(glimpseText({ ...base, body: '', file: { kind: 'pdf' } })).toBe('[file]');
    expect(glimpseText({ ...base, body: 'x'.repeat(100) })).toHaveLength(80);
  });
});

describe('Next call box', () => {
  const answer = (lists, reminders = []) => ({
    configured: true,
    calls: { live: [], upcoming: [], recent: [], ...lists },
    reminders,
  });
  const call = (id, title, status, scheduledFor = null) => ({ id, title, status, scheduledFor });

  it('a live call: Live now and Listen, for guests too', async () => {
    mockApi(GUEST);
    inRouter(<NextCallCard calls={answer({ live: [call(2, 'Town hall', 'live')] })} />);
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Listen to Town hall' })).toHaveAttribute(
      'href',
      '/calls/2'
    );
  });

  it('the next planned call: its time, calendar file, and a reminder for members only', async () => {
    const planned = answer({ upcoming: [call(5, 'Q&A', 'scheduled', '2026-10-22T18:30:00Z')] });
    mockApi(GUEST);
    const view = inRouter(<NextCallCard calls={planned} />);
    expect(await screen.findByRole('link', { name: 'Add Q&A to calendar' })).toHaveAttribute(
      'href',
      '/api/calls/5/calendar.ics'
    );
    expect(screen.queryByRole('button', { name: /Remind me/ })).toBeNull();
    view.unmount();

    mockApi(signedIn({ id: 4, username: 'mia', role: 'member' }));
    inRouter(<NextCallCard calls={{ ...planned, reminders: [5] }} />);
    expect(
      await screen.findByRole('button', { name: 'Remind me of Q&A on this site' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('nothing planned: one friendly line and the way to the Calls page', () => {
    mockApi(GUEST);
    inRouter(<NextCallCard calls={answer({})} />);
    expect(screen.getByText(/No call is planned yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All calls' })).toHaveAttribute('href', '/calls');
  });
});
