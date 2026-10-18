// ============================================================
// File:        mentions.test.jsx
// Path:        client/src/chat/mentions.test.jsx
// Project:     Seasonal Entertainment
// Description: @mentions in the browser: a resolved mention is a name chip opening the name
//              menu; a message mentioning the reader is highlighted for them; an unknown
//              "@name" and hostile text stay plain text; typing "@ki" suggests members who may
//              read the room (arrows, Enter inserts "@kira ", Escape closes); guests get no
//              suggestions; an unread mention puts an "@" on the room's count and the blue dot,
//              also for a muted room.
// ============================================================

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

const MIA = { id: 1, username: 'mia', role: 'member' };
const msg = (id, body, mentions) => ({
  id,
  room: 'general',
  author: 'zoe',
  authorId: 8,
  isGuest: false,
  kind: 'text',
  body,
  media: null,
  file: null,
  preview: null,
  mentions,
  createdAt: '2026-10-18T09:00:00.000Z',
  hiddenAt: null,
});
let calls;

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

function chat(session, { muted = false } = {}) {
  calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator: false },
      },
    },
    'GET /chat/rooms/general/messages': {
      body: {
        ok: true,
        messages: [
          msg(5, 'hey @mia and @kira, not @ghost', [
            { id: 1, username: 'mia' },
            { id: 9, username: 'kira' },
          ]),
          msg(6, '@<img src=x onerror=alert(1)>', []),
        ],
      },
    },
    'GET /chat/favourites': { body: { ok: true, rooms: [], users: [] } },
    'GET /chat/unread': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', count: 2, muted, mentions: 1 }],
        direct: [],
      },
    },
    'POST /chat/rooms/general/read': { body: { ok: true } },
    'GET /chat/members?q=ki&room=general': {
      body: {
        ok: true,
        members: [
          { id: 9, username: 'kira', canReceive: true, online: false },
          { id: 10, username: 'kimi', canReceive: true, online: false },
        ],
      },
    },
  });
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
}

const list = () => screen.getByRole('list', { name: 'Messages in General' });

it('draws chips for resolved mentions and highlights the reader’s own', async () => {
  chat(signedIn(MIA));
  await screen.findByRole('list', { name: 'Messages in General' });
  const message = (await within(list()).findByText(/not @ghost/)).closest('li');
  expect(message).toHaveClass('chat-message--mention');
  // Kira's chip opens the name menu; the reader's own name is a chip without a menu.
  fireEvent.click(within(message).getByRole('button', { name: '@kira' }));
  expect(screen.getByRole('menu', { name: '@kira' })).toBeInTheDocument();
  expect(within(message).getByText('@mia').closest('.chat-mention')).not.toBeNull();
  expect(within(message).queryByRole('button', { name: '@ghost' })).toBeNull();
  // Hostile text is text.
  const hostile = within(list()).getByText('@<img src=x onerror=alert(1)>').closest('li');
  expect(hostile.querySelector('img')).toBeNull();
  expect(hostile).not.toHaveClass('chat-message--mention');
});

it('suggests members of the room while "@name" is typed', async () => {
  chat(signedIn(MIA));
  const field = await screen.findByLabelText('Message');
  fireEvent.change(field, { target: { value: 'hi @ki', selectionStart: 6 } });
  const suggestions = await screen.findByRole('listbox', { name: 'Mention a member' });
  expect(
    within(suggestions)
      .getAllByRole('option')
      .map((o) => o.textContent)
  ).toEqual(['@kira', '@kimi']);
  fireEvent.keyDown(field, { key: 'ArrowDown' });
  fireEvent.keyDown(field, { key: 'ArrowUp' });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(field).toHaveValue('hi @kira ');
  expect(screen.queryByRole('listbox', { name: 'Mention a member' })).toBeNull();

  fireEvent.change(field, { target: { value: 'hi @ki', selectionStart: 6 } });
  await screen.findByRole('listbox', { name: 'Mention a member' });
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(screen.queryByRole('listbox', { name: 'Mention a member' })).toBeNull();
  expect(field).toHaveValue('hi @ki');
});

it('a pick just before the panel closes does no harm', async () => {
  chat(signedIn(MIA));
  const field = await screen.findByLabelText('Message');
  fireEvent.change(field, { target: { value: 'hi @ki', selectionStart: 6 } });
  await screen.findByRole('listbox', { name: 'Mention a member' });
  fireEvent.keyDown(field, { key: 'Enter' });
  cleanup(); // the panel is gone before the next frame
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)));
});

it('guests get no suggestions', async () => {
  chat(GUEST);
  const field = await screen.findByLabelText('Message');
  fireEvent.change(field, { target: { value: 'hi @ki', selectionStart: 6 } });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(screen.queryByRole('listbox', { name: 'Mention a member' })).toBeNull();
  expect(calls.some((c) => c.key.startsWith('GET /chat/members'))).toBe(false);
});

it('an unread mention marks the room and the blue dot with "@", also when muted', async () => {
  chat(signedIn(MIA), { muted: true });
  const rooms = screen.getByRole('navigation', { name: 'Rooms' });
  const count = await within(rooms).findByRole('img', {
    name: '2 unread in General, with a mention of you',
  });
  expect(count).toHaveTextContent('@2');
  expect(count).not.toHaveClass('chat-count--dim');
  // Muted: no room messages in the total, but the mention still shows.
  expect(screen.getByRole('link', { name: 'Chat: 1 mention' })).toHaveTextContent('@');
});
