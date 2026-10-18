// ============================================================
// File:        chatPreviews.test.jsx
// Path:        client/src/chat/chatPreviews.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards link preview cards in the chat page: title as a safe link, description,
//              site name and the image from this site; a card without an image; cards pushed
//              live, held back for non-moderators after a report, removed by a moderator.
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

const PREVIEW = {
  url: 'https://seasonaltokens.org/',
  title: 'Seasonal Tokens',
  description: 'Four tokens, one for each season.',
  siteName: 'seasonaltokens.org',
  image: { url: '/media/previews/abc.webp', width: 480, height: 252 },
};
const message = (id, preview) => ({
  id,
  room: 'general',
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body: 'look https://seasonaltokens.org/',
  media: null,
  preview,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

async function chat(session, messages, moderator = false) {
  const calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator },
      },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages } },
    'POST /chat/messages/1/preview/remove': { body: { ok: true } },
  });
  await renderApp('/chat');
  return calls;
}

describe('preview cards', () => {
  it('shows title (as a safe link), description, site and the image from this site', async () => {
    await chat(GUEST, [message(1, PREVIEW)]);
    const card = await screen.findByRole('complementary', {
      name: 'Link preview: Seasonal Tokens',
    });
    expect(within(card).getByRole('link', { name: 'Seasonal Tokens' })).toHaveAttribute(
      'rel',
      'nofollow noopener noreferrer ugc'
    );
    expect(within(card).getByText('Four tokens, one for each season.')).toBeInTheDocument();
    expect(within(card).getByText('seasonaltokens.org')).toBeInTheDocument();
    expect(
      within(card).getByRole('img', { name: 'Image from seasonaltokens.org' })
    ).toHaveAttribute('src', '/media/previews/abc.webp');
  });

  it('works without an image', async () => {
    await chat(GUEST, [message(1, { ...PREVIEW, image: null, siteName: null })]);
    const card = await screen.findByRole('complementary', {
      name: 'Link preview: Seasonal Tokens',
    });
    expect(within(card).queryByRole('img')).toBeNull();
    expect(within(card).getByText('seasonaltokens.org')).toBeInTheDocument();
  });

  it('arrives live and is held back after a report (non-moderators)', async () => {
    await chat(GUEST, [message(1, null)]);
    await screen.findByText(/look/);
    FakeSocket.all.at(-1).push({ type: 'preview', id: 1, preview: PREVIEW, room: 'general' });
    expect(
      screen.getByRole('complementary', { name: 'Link preview: Seasonal Tokens' })
    ).toBeInTheDocument();
    FakeSocket.all.at(-1).push({ type: 'previewHidden', id: 1, room: 'general' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('a moderator removes a preview', async () => {
    const calls = await chat(
      signedIn({ id: 2, username: 'olga', role: 'organiser' }),
      [message(1, PREVIEW)],
      true
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Actions for the message from/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove preview' }));
    await vi.waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(calls.some((c) => c.key === 'POST /chat/messages/1/preview/remove')).toBe(true);
  });
});
