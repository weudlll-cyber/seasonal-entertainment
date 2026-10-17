// ============================================================
// File:        chatPreviews.test.jsx
// Path:        client/src/chat/chatPreviews.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards link preview cards in the chat page: title as a safe link, description,
//              site name and the image from this site; a card without an image; cards pushed
//              live, held back for non-moderators after a report, removed by a moderator.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

class FakeSocket {
  static last = null;
  constructor() {
    FakeSocket.last = this;
  }
  send() {}
  close() {}
  push(event) {
    act(() => this.onmessage?.({ data: JSON.stringify(event) }));
  }
}
beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));

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

function chat(session, messages, moderator = false) {
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
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <App />
    </MemoryRouter>
  );
  return calls;
}

describe('preview cards', () => {
  it('shows title (as a safe link), description, site and the image from this site', async () => {
    chat(GUEST, [message(1, PREVIEW)]);
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
    chat(GUEST, [message(1, { ...PREVIEW, image: null, siteName: null })]);
    const card = await screen.findByRole('complementary', {
      name: 'Link preview: Seasonal Tokens',
    });
    expect(within(card).queryByRole('img')).toBeNull();
    expect(within(card).getByText('seasonaltokens.org')).toBeInTheDocument();
  });

  it('arrives live and is held back after a report (non-moderators)', async () => {
    chat(GUEST, [message(1, null)]);
    await screen.findByText(/look/);
    FakeSocket.last.push({ type: 'preview', id: 1, preview: PREVIEW });
    expect(
      screen.getByRole('complementary', { name: 'Link preview: Seasonal Tokens' })
    ).toBeInTheDocument();
    FakeSocket.last.push({ type: 'previewHidden', id: 1 });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('a moderator removes a preview', async () => {
    const calls = chat(
      signedIn({ id: 2, username: 'olga', role: 'organiser' }),
      [message(1, PREVIEW)],
      true
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove preview' }));
    await vi.waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(calls.some((c) => c.key === 'POST /chat/messages/1/preview/remove')).toBe(true);
  });
});
