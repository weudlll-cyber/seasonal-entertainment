// ============================================================
// File:        chatMedia.test.jsx
// Path:        client/src/chat/chatMedia.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards stickers and GIFs in the chat page: guests see only the Emoji tab and a
//              hint; members get Stickers and GIFs with the packs in the server's order; a
//              choice becomes the message's one attachment (× removes it), sent with the text
//              or alone; messages show the image with alt text, a credit on demand, and
//              "Media removed" for an item that is gone.
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

// The picker's own tabs (the chat page also has Rooms / Direct tabs).
const pickerTabs = () =>
  within(screen.getByRole('tablist', { name: 'Picker' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent);
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

async function chat(session, messages = []) {
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
  await renderApp('/chat');
  return calls;
}

describe('picker', () => {
  it('guests get only the Emoji tab and a hint', async () => {
    const calls = await chat(GUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Emoji' }));
    expect(pickerTabs()).toEqual(['Emoji']);
    expect(screen.getByText('Log in to send stickers and GIFs.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /chat/media')).toBe(false);
  });

  it('members get Stickers and GIFs, packs in order; a choice becomes the attachment', async () => {
    const calls = await chat(signedIn({ id: 1, username: 'mia', role: 'member' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Emoji, stickers, GIFs' }));
    expect(pickerTabs()).toEqual(['Emoji', 'Stickers', 'GIFs']);
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    const panel = screen.getByRole('tabpanel', { name: 'Stickers' });
    await within(panel).findByRole('region', { name: 'Seasons' });
    expect(
      within(panel)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label'))
    ).toEqual(['Seasons', 'Coins']);
    fireEvent.click(screen.getByRole('button', { name: 'Spring badge picture' }));
    // Not sent on click: it waits above the message field until Send.
    const attached = screen.getByRole('group', { name: 'Attachment' });
    expect(within(attached).getByRole('img', { name: 'Spring badge picture' })).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /chat/rooms/general/messages')).toBe(false);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'well done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages')?.body).toEqual({
        body: 'well done',
        attachment: { type: 'sticker', itemId: 11 },
      })
    );
    await vi.waitFor(() => expect(screen.queryByRole('group', { name: 'Attachment' })).toBeNull());
    expect(screen.getByLabelText('Message')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Emoji, stickers, GIFs' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GIFs' }));
    expect(
      within(screen.getByRole('tabpanel', { name: 'GIFs' })).getAllByRole('region')
    ).toHaveLength(1);
  });
});

describe('the message being written', () => {
  const pickSticker = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Emoji, stickers, GIFs' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Spring badge picture' }));
  };

  it('an attachment alone can be sent', async () => {
    const calls = await chat(signedIn({ id: 1, username: 'mia', role: 'member' }));
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await pickSticker();
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages')?.body).toEqual({
        body: '',
        attachment: { type: 'sticker', itemId: 11 },
      })
    );
  });

  it('× takes the attachment off again; then only the text is sent', async () => {
    const calls = await chat(signedIn({ id: 1, username: 'mia', role: 'member' }));
    await pickSticker();
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment Spring badge' }));
    expect(screen.queryByRole('group', { name: 'Attachment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'text only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages')?.body).toEqual({
        body: 'text only',
      })
    );
  });
});

describe('messages', () => {
  it('shows stickers and GIFs with alt text, credits on demand, and removed media', async () => {
    await chat(GUEST, [
      message(1, 'sticker', item(12, 'Silver coin', 'Foxeane')),
      message(2, 'gif', item(13, 'Spin')),
      message(3, 'gif', null),
      { ...message(4, 'sticker', item(11, 'Spring badge')), body: 'look at this' },
    ]);
    // Text and attachment of one message show together.
    const both = (await screen.findByText('look at this')).closest('li');
    expect(within(both).getByRole('img', { name: 'Spring badge picture' })).toBeInTheDocument();
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
