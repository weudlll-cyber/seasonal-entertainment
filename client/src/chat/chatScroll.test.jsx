// ============================================================
// File:        chatScroll.test.jsx
// Path:        client/src/chat/chatScroll.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the message list's scrolling in both variants: it opens at the newest
//              message, follows new messages while the reader is at the bottom, does not jump
//              when they have scrolled up but offers "New messages", which scrolls down; a
//              room switch starts at the newest message again. jsdom has no layout, so the
//              list's heights are given here.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import { ChatPanel } from './index.js';

// Every message list: 300 px visible, contentHeight px of content.
let contentHeight = 1000;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  contentHeight = 1000;
  Object.defineProperty(HTMLOListElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => contentHeight,
  });
  Object.defineProperty(HTMLOListElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 300,
  });
});
afterEach(() => {
  delete HTMLOListElement.prototype.scrollHeight;
  delete HTMLOListElement.prototype.clientHeight;
});

const msg = (id, room = 'general') => ({
  id,
  room,
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body: `message ${id} in ${room}`,
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

function show(ui) {
  mockApi({
    ...GUEST,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [
          { slug: 'general', name: 'General', canWrite: true },
          { slug: 'announcements', name: 'Announcements', canWrite: false },
        ],
        me: { guestName: null, moderator: false },
      },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [msg(1), msg(2), msg(3)] } },
    'GET /chat/rooms/announcements/messages': {
      body: { ok: true, messages: [msg(7, 'announcements')] },
    },
  });
  render(<SessionProvider>{ui}</SessionProvider>);
}

const listOf = (name) => screen.getByRole('list', { name: `Messages in ${name}` });
const arrive = (id) => {
  contentHeight += 100;
  FakeSocket.all.at(-1).push({ type: 'message', message: msg(id), room: 'general' });
};

describe.each(['full', 'compact'])('the %s variant', (variant) => {
  it('opens at the newest message and follows new ones while at the bottom', async () => {
    show(<ChatPanel room="general" variant={variant} />);
    await screen.findByText('message 3 in general');
    const list = listOf('General');
    expect(list.scrollTop).toBe(1000);
    arrive(4);
    expect(list.scrollTop).toBe(1100);
    expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull();
  });

  it('scrolled up: no jump, but "New messages", which scrolls down', async () => {
    show(<ChatPanel room="general" variant={variant} />);
    await screen.findByText('message 3 in general');
    const list = listOf('General');
    list.scrollTop = 200;
    fireEvent.scroll(list);
    arrive(4);
    expect(list.scrollTop).toBe(200);
    const button = screen.getByRole('button', { name: 'New messages' });
    fireEvent.click(button);
    expect(list.scrollTop).toBe(1100);
    expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull();
  });

  it('near the bottom counts as at the bottom', async () => {
    show(<ChatPanel room="general" variant={variant} />);
    await screen.findByText('message 3 in general');
    const list = listOf('General');
    list.scrollTop = 680; // 20 px above the end
    fireEvent.scroll(list);
    arrive(4);
    expect(list.scrollTop).toBe(1100);
  });
});

it('switching rooms starts at the newest message of the new room', async () => {
  show(<ChatPanel room="general" showRoomTabs />);
  await screen.findByText('message 3 in general');
  const general = listOf('General');
  general.scrollTop = 100;
  fireEvent.scroll(general);
  const tabs = screen.getByRole('navigation', { name: 'Rooms' });
  fireEvent.click(within(tabs).getByRole('button', { name: 'Announcements' }));
  await screen.findByText('message 7 in announcements');
  expect(listOf('Announcements').scrollTop).toBe(1000);
});
