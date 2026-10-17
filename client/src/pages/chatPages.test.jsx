// ============================================================
// File:        chatPages.test.jsx
// Path:        client/src/pages/chatPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the chat screens with a fake WebSocket: guests write with a guest note,
//              only members' links become links, pushed messages appear and hidden ones go,
//              moderator actions only for moderators, and the admin page lifts a sanction.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

class FakeSocket {
  static last = null;
  constructor(url) {
    this.url = url;
    this.sent = [];
    FakeSocket.last = this;
    setTimeout(() => this.onopen?.());
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  push(event) {
    act(() => this.onmessage?.({ data: JSON.stringify(event) }));
  }
}

beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

const msg = (id, author, body, isGuest = false) => ({
  id,
  room: 'general',
  author,
  isGuest,
  body,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

const rooms = (me) => ({
  'GET /chat/rooms': {
    body: { ok: true, rooms: [{ slug: 'general', name: 'General', canWrite: true }], me },
  },
});

describe('chat page', () => {
  it('a guest writes; links of guests stay text, members get real links', async () => {
    const calls = mockApi({
      ...GUEST,
      ...rooms({ guestName: null, moderator: false }),
      'GET /chat/rooms/general/messages': {
        body: {
          ok: true,
          messages: [
            msg(1, 'mia', 'see https://seasonaltokens.org/'),
            msg(2, 'Guest-ab12', 'visit https://evil.example/', true),
          ],
        },
      },
      'POST /chat/rooms/general/messages': {
        status: 201,
        body: { ok: true, message: msg(3, 'Guest-cd34', 'hello', true) },
      },
    });
    renderAt('/chat');
    expect(
      await screen.findByRole('link', { name: 'https://seasonaltokens.org/' })
    ).toHaveAttribute('rel', 'nofollow noopener noreferrer ugc');
    expect(screen.queryByRole('link', { name: 'https://evil.example/' })).toBeNull();
    expect(screen.getByText('visit https://evil.example/')).toBeInTheDocument();
    expect(screen.getAllByText('Guest')).toHaveLength(1);
    expect(screen.getByText(/your first message gets a guest name/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages').body).toEqual({
      body: 'hello',
    });
  });

  it('subscribes to the room, shows pushed messages and removes hidden ones', async () => {
    mockApi({
      ...signedIn({ id: 2, username: 'mia', role: 'member' }),
      ...rooms({ guestName: null, moderator: false }),
      'GET /chat/rooms/general/messages': {
        body: { ok: true, messages: [msg(1, 'bert', 'first')] },
      },
    });
    renderAt('/chat');
    await screen.findByText('first');
    await vi.waitFor(() =>
      expect(FakeSocket.last.sent).toEqual([{ type: 'subscribe', room: 'general' }])
    );
    FakeSocket.last.push({ type: 'message', message: msg(5, 'carla', 'live one') });
    expect(await screen.findByText('live one')).toBeInTheDocument();
    FakeSocket.last.push({ type: 'hidden', id: 1 });
    await vi.waitFor(() => expect(screen.queryByText('first')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('moderators get Hide, Mute and Ban', async () => {
    const calls = mockApi({
      ...signedIn({ id: 3, username: 'olga', role: 'organiser' }),
      ...rooms({ guestName: null, moderator: true }),
      'GET /chat/rooms/general/messages': {
        body: { ok: true, messages: [msg(1, 'bert', 'spam')] },
      },
      'POST /chat/messages/1/mute': { body: { ok: true } },
    });
    renderAt('/chat');
    const item = (await screen.findByText('spam')).closest('li');
    expect(within(item).getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Ban' })).toBeInTheDocument();
    fireEvent.click(within(item).getByRole('button', { name: 'Mute 1 h' }));
    expect(await screen.findByText('Author muted.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /chat/messages/1/mute').body).toEqual({ minutes: 60 });
  });
});

describe('admin chat page', () => {
  it('lists active sanctions and lifts one', async () => {
    const calls = mockApi({
      ...signedIn({ id: 1, username: 'ada', role: 'admin' }),
      'GET /admin/chat/rooms': { body: { ok: true, rooms: [] } },
      'GET /chat/reports': { body: { ok: true, messages: [] } },
      'GET /chat/sanctions': {
        body: {
          ok: true,
          sanctions: [{ id: 7, kind: 'ban', target: 'Guest-ab12', until: null, createdBy: 'olga' }],
        },
      },
      'POST /chat/sanctions/7/lift': { body: { ok: true } },
    });
    renderAt('/admin/chat');
    const entry = (await screen.findByText('Guest-ab12')).closest('li');
    expect(entry).toHaveTextContent('(no end)');
    fireEvent.click(within(entry).getByRole('button', { name: 'Lift' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /chat/sanctions/7/lift')).toBe(true)
    );
  });
});
