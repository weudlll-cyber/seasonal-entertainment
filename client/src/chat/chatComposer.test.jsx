// ============================================================
// File:        chatComposer.test.jsx
// Path:        client/src/chat/chatComposer.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the chat composer's emoji picker: open to everyone (guests too), an
//              emoji goes into the text at the cursor, and the message is sent as plain text.
// ============================================================

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST, mockApi } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

class FakeSocket {
  send() {}
  close() {}
}
beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));

const sent = (body) => ({
  status: 201,
  body: {
    ok: true,
    message: {
      id: 9,
      room: 'general',
      author: 'Guest-k7m2qa',
      isGuest: true,
      body,
      createdAt: '2026-10-17T18:00:00.000Z',
      hiddenAt: null,
    },
  },
});

async function guestChat() {
  const calls = mockApi({
    ...GUEST,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: 'Guest-k7m2qa', moderator: false },
      },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages: [] } },
    'POST /chat/rooms/general/messages': (request) => sent(request.body),
  });
  await renderApp('/chat');
  return calls;
}

describe('emoji picker', () => {
  it('a guest puts an emoji at the cursor and sends it as text', async () => {
    const calls = await guestChat();
    const field = await screen.findByLabelText('Message');
    fireEvent.change(field, { target: { value: 'Hi all' } });
    field.setSelectionRange(3, 3); // after "Hi "
    fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'party popper' }));
    expect(field).toHaveValue('Hi 🎉all');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Hi 🎉all')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages').body).toEqual({
      body: 'Hi 🎉all',
    });
  });

  it('shows the emoji groups only when opened', async () => {
    await guestChat();
    const toggle = await screen.findByRole('button', { name: 'Emoji' });
    expect(screen.queryByRole('region', { name: 'Seasons and nature' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Seasons and nature' })).toBeInTheDocument();
  });
});
