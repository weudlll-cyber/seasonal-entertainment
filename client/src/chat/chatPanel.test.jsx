// ============================================================
// File:        chatPanel.test.jsx
// Path:        client/src/chat/chatPanel.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the chat module as a reusable part: a ChatPanel works on its own, with
//              only the account context around it (no app layout, no router), and several
//              panels on one page share one live connection, each showing only its room. The
//              sender's own message pushed live before its send is answered shows once, and the
//              composer keeps the text until the answer (SE-NIGHT-3 piece 4).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi } from '../test/mockApi.js';
import { ChatPanel } from './index.js';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const msg = (id, room, body) => ({
  id,
  room,
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body,
  media: null,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

function api(extra = {}) {
  return mockApi({
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
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [msg(1, 'general', 'hi')] } },
    'GET /chat/rooms/announcements/messages': {
      body: { ok: true, messages: [msg(2, 'announcements', 'news')] },
    },
    ...extra,
  });
}

const alone = (ui) => render(<SessionProvider>{ui}</SessionProvider>);

describe('ChatPanel on its own', () => {
  it('shows its room and sends, with nothing around it but the account context', async () => {
    const calls = api({
      'POST /chat/rooms/general/messages': {
        status: 201,
        body: { ok: true, message: msg(3, 'general', 'hello') },
      },
    });
    alone(<ChatPanel room="general" variant="compact" />);
    const panel = await screen.findByRole('region', { name: 'Chat: General' });
    expect(panel).toHaveClass('se-chat', 'se-chat--compact');
    expect(await within(panel).findByText('hi')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Message'), { target: { value: 'hello' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    // In the message list: until the send is answered, the composer's field holds the text too.
    const list = within(panel).getByRole('list', { name: 'Messages in General' });
    expect(await within(list).findByText('hello')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /chat/rooms/general/messages')).toBe(true);
  });

  it('its own message pushed before the send is answered: shown once; the field clears after', async () => {
    let answer;
    api({
      // The answer is held back until the push has arrived (as the socket often wins).
      'POST /chat/rooms/general/messages': () => new Promise((resolve) => (answer = resolve)),
    });
    alone(<ChatPanel room="general" variant="compact" />);
    const panel = await screen.findByRole('region', { name: 'Chat: General' });
    const list = within(panel).getByRole('list', { name: 'Messages in General' });
    await within(list).findByText('hi');
    await vi.waitFor(() => expect(FakeSocket.all[0]?.sent).toHaveLength(1));
    const field = within(panel).getByLabelText('Message');
    fireEvent.change(field, { target: { value: 'mine' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));

    FakeSocket.all[0].push({
      type: 'message',
      message: msg(5, 'general', 'mine'),
      room: 'general',
    });
    expect(within(list).getAllByText('mine')).toHaveLength(1);
    expect(field).toHaveValue('mine'); // not sent yet as far as the composer knows

    answer({ status: 201, body: { ok: true, message: msg(5, 'general', 'mine') } });
    await vi.waitFor(() => expect(field).toHaveValue(''));
    expect(within(list).getAllByText('mine')).toHaveLength(1);
  });
});

describe('several panels on one page', () => {
  it('share one connection; each shows only the messages of its own room', async () => {
    api();
    alone(
      <>
        <ChatPanel room="general" variant="compact" />
        <ChatPanel room="announcements" variant="compact" />
      </>
    );
    const general = await screen.findByRole('region', { name: 'Chat: General' });
    const news = await screen.findByRole('region', { name: 'Chat: Announcements' });
    await within(general).findByText('hi');
    await vi.waitFor(() => expect(FakeSocket.all[0]?.sent).toHaveLength(2));
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].sent.map((s) => s.room).sort()).toEqual(['announcements', 'general']);

    FakeSocket.all[0].push({
      type: 'message',
      message: msg(9, 'announcements', 'only here'),
      room: 'announcements',
    });
    expect(within(news).getByText('only here')).toBeInTheDocument();
    expect(within(general).queryByText('only here')).toBeNull();
  });
});
