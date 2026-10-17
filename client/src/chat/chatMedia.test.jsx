// ============================================================
// File:        chatMedia.test.jsx
// Path:        client/src/chat/chatMedia.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards stickers and GIFs in the chat page: guests see only the Emoji tab and a
//              hint; members get Stickers and GIFs with the packs in the server's order and
//              send an item by id; messages show the image with alt text, a credit on demand,
//              and "Media removed" for an item that is gone.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

class FakeSocket {
  send() {}
  close() {}
}
beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));

const item = (id, name, credit = null) => ({
  id,
  name,
  alt: `${name} picture`,
  credit,
  url: `/media/${id}.webp`,
  width: 512,
  height: 512,
});
const LIBRARY = [
  { id: 1, name: 'Seasons', kind: 'sticker', items: [item(11, 'Spring badge')] },
  { id: 2, name: 'Coins', kind: 'sticker', items: [item(12, 'Silver coin', 'Foxeane')] },
  { id: 3, name: 'Seasonal Tokens', kind: 'gif', items: [item(13, 'Spin')] },
];
const message = (id, kind, media) => ({
  id,
  room: 'general',
  author: 'mia',
  isGuest: false,
  kind,
  body: '',
  media,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

function chat(session, messages = []) {
  const calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator: false },
      },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages } },
    'GET /chat/media': { body: { ok: true, packs: LIBRARY } },
    'POST /chat/rooms/general/messages': {
      status: 201,
      body: { ok: true, message: message(99, 'sticker', item(11, 'Spring badge')) },
    },
  });
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
  return calls;
}

describe('picker', () => {
  it('guests get only the Emoji tab and a hint', async () => {
    const calls = chat(GUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Emoji' }));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Emoji']);
    expect(screen.getByText('Log in to send stickers and GIFs.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /chat/media')).toBe(false);
  });

  it('members get Stickers and GIFs, packs in order, and send an item by id', async () => {
    const calls = chat(signedIn({ id: 1, username: 'mia', role: 'member' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Emoji, stickers, GIFs' }));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Emoji',
      'Stickers',
      'GIFs',
    ]);
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    const panel = screen.getByRole('tabpanel');
    await within(panel).findByRole('region', { name: 'Seasons' });
    expect(
      within(panel)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label'))
    ).toEqual(['Seasons', 'Coins']);
    fireEvent.click(screen.getByRole('button', { name: 'Spring badge picture' }));
    await screen.findByRole('img', { name: 'Spring badge picture' });
    expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages').body).toEqual({
      kind: 'sticker',
      itemId: 11,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Emoji, stickers, GIFs' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GIFs' }));
    expect(within(screen.getByRole('tabpanel')).getAllByRole('region')).toHaveLength(1);
  });
});

describe('messages', () => {
  it('shows stickers and GIFs with alt text, credits on demand, and removed media', async () => {
    chat(GUEST, [
      message(1, 'sticker', item(12, 'Silver coin', 'Foxeane')),
      message(2, 'gif', item(13, 'Spin')),
      message(3, 'gif', null),
    ]);
    const sticker = await screen.findByRole('img', { name: 'Silver coin picture' });
    expect(sticker).toHaveClass('chat-media--sticker');
    expect(sticker.closest('figure')).toHaveAttribute('title', 'Credit: Foxeane');
    expect(screen.queryByText('Credit: Foxeane')).toBeNull();
    fireEvent.click(sticker);
    expect(screen.getByText('Credit: Foxeane')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Spin picture' })).toHaveClass('chat-media--gif');
    expect(screen.getByText('Media removed')).toBeInTheDocument();
  });
});
