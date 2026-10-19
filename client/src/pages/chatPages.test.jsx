// ============================================================
// File:        chatPages.test.jsx
// Path:        client/src/pages/chatPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the chat screens with a fake WebSocket: guests write with a guest note,
//              only members' links become links, pushed messages appear and hidden ones go,
//              moderator actions only for moderators, and the admin page lifts a sanction.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const renderAt = (path) => renderApp(path);

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
    await renderAt('/chat');
    expect(
      await screen.findByRole('link', { name: 'https://seasonaltokens.org/' })
    ).toHaveAttribute('rel', 'nofollow noopener noreferrer ugc');
    expect(screen.queryByRole('link', { name: 'https://evil.example/' })).toBeNull();
    expect(screen.getByText('visit https://evil.example/')).toBeInTheDocument();
    expect(screen.getAllByText('Guest')).toHaveLength(1);
    expect(screen.getByText(/your first message gets a guest name/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    // In the message list: until the send is answered, the composer's field holds the text too.
    const list = screen.getByRole('list', { name: 'Messages in General' });
    expect(await within(list).findByText('hello')).toBeInTheDocument();
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
    await renderAt('/chat');
    await screen.findByText('first');
    await vi.waitFor(() =>
      expect(FakeSocket.all.at(-1).sent).toEqual([{ type: 'subscribe', room: 'general' }])
    );
    FakeSocket.all.at(-1).push({
      type: 'message',
      message: msg(5, 'carla', 'live one'),
      room: 'general',
    });
    expect(await screen.findByText('live one')).toBeInTheDocument();
    FakeSocket.all.at(-1).push({ type: 'hidden', id: 1, room: 'general' });
    await vi.waitFor(() => expect(screen.queryByText('first')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('a member\'s "…" menu has Report only, and it reports', async () => {
    const calls = mockApi({
      ...signedIn({ id: 4, username: 'mia', role: 'member' }),
      ...rooms({ guestName: null, moderator: false }),
      'GET /chat/rooms/general/messages': {
        body: { ok: true, messages: [msg(1, 'bert', 'spam')] },
      },
      'POST /chat/messages/1/report': { body: { ok: true } },
    });
    await renderAt('/chat');
    const item = (await screen.findByText('spam')).closest('li');
    fireEvent.click(within(item).getByRole('button', { name: /^Actions for the message from/ }));
    const menu = within(item).getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((b) => b.textContent)
    ).toEqual(['Report']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Report' }));
    expect(await screen.findByText('Reported. Thank you.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /chat/messages/1/report')).toBe(true);
  });

  it('moderators get Hide, Mute and Ban', async () => {
    const calls = mockApi({
      ...signedIn({ id: 3, username: 'olga', role: 'organiser' }),
      ...rooms({ guestName: null, moderator: true }),
      'GET /chat/rooms/general/messages': {
        body: { ok: true, messages: [msg(1, 'bert', 'spam')] },
      },
      'POST /chat/messages/1/mute': { body: { ok: true } },
      'POST /chat/messages/1/ban': { body: { ok: true } },
    });
    await renderAt('/chat');
    const item = (await screen.findByText('spam')).closest('li');
    const more = within(item).getByRole('button', { name: /^Actions for the message from/ });
    fireEvent.click(more);
    // Exactly the actions moderators had as links before.
    expect(
      within(item)
        .getAllByRole('menuitem')
        .map((b) => b.textContent)
    ).toEqual(['Report', 'Hide', 'Mute 10 min', 'Mute 1 h', 'Mute 24 h', 'Ban']);
    fireEvent.click(within(item).getByRole('menuitem', { name: 'Mute 1 h' }));
    expect(await screen.findByText('Author muted.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /chat/messages/1/mute').body).toEqual({ minutes: 60 });

    // Ban asks first: Cancel sends nothing, the confirm button bans.
    fireEvent.click(more);
    fireEvent.click(within(item).getByRole('menuitem', { name: 'Ban' }));
    const ask = within(item).getByRole('group', { name: 'Ban bert from the chat?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.key === 'POST /chat/messages/1/ban')).toBe(false);
    fireEvent.click(more);
    fireEvent.click(within(item).getByRole('menuitem', { name: 'Ban' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Ban' }));
    expect(await screen.findByText('Author banned from the chat.')).toBeInTheDocument();
  });
});

describe('admin chat page', () => {
  it('shows and saves whether guests may write in a room', async () => {
    const general = { slug: 'general', name: 'General', readAccess: 'everyone' };
    const calls = mockApi({
      ...signedIn({ id: 1, username: 'ada', role: 'admin' }),
      'GET /admin/chat/rooms': {
        body: {
          ok: true,
          rooms: [{ id: 1, ...general, writeAccess: 'everyone', guestWritable: true }],
        },
      },
      'GET /chat/reports': { body: { ok: true, messages: [] } },
      'GET /chat/sanctions': { body: { ok: true, sanctions: [] } },
      'PUT /admin/chat/rooms/1': { body: { ok: true } },
    });
    await renderAt('/admin/chat');
    const flag = await screen.findByRole('checkbox', { name: 'Guests write in General' });
    expect(flag).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Guests write in new room' })).not.toBeChecked();
    fireEvent.click(flag);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'PUT /admin/chat/rooms/1')?.body).toEqual({
        ...general,
        writeAccess: 'everyone',
        guestWritable: false,
      })
    );
  });

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
    await renderAt('/admin/chat');
    const entry = (await screen.findByText('Guest-ab12')).closest('li');
    expect(entry).toHaveTextContent('(no end)');
    fireEvent.click(within(entry).getByRole('button', { name: 'Lift' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /chat/sanctions/7/lift')).toBe(true)
    );
  });
});
