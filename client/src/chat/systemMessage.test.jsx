// ============================================================
// File:        systemMessage.test.jsx
// Path:        client/src/chat/systemMessage.test.jsx
// Project:     Seasonal Entertainment
// Description: The site's own chat message (the weekly recap, docs/CHAT.md): its sender with a
//              Site badge and no name menu (no account behind it), and its site paths as links
//              within the site; the same path in a member's message stays text.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatMessage from './ChatMessage.jsx';

vi.mock('../session/SessionContext.jsx', () => ({ useSession: () => ({ user: null }) }));

const message = (fields) => ({
  id: 1,
  room: 'announcements',
  author: 'Seasonal Entertainment',
  authorId: null,
  isGuest: false,
  isSystem: true,
  kind: 'text',
  body: 'The next 7 days:\n- Live now: Community call, a call on this site: /calls/12\n\nInformation only — not financial advice. Disclaimer: /info/disclaimer',
  createdAt: '2026-10-26T08:00:00Z',
  media: null,
  file: null,
  preview: null,
  ...fields,
});

const show = (fields) =>
  render(
    <ul>
      <ChatMessage message={message(fields)} moderator={false} onAction={() => {}} />
    </ul>
  );

describe("the site's own message", () => {
  it('shows the sender with a Site badge and no name menu', () => {
    show();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Seasonal Entertainment').tagName).toBe('STRONG');
    expect(within(item).getByText('Site')).toBeInTheDocument();
    // The name menu's button carries just the name; the "…" menu (Report) stays.
    expect(within(item).queryByRole('button', { name: 'Seasonal Entertainment' })).toBeNull();
  });

  it('turns its site paths into links within the site', () => {
    show();
    expect(screen.getByRole('link', { name: '/calls/12' })).toHaveAttribute('href', '/calls/12');
    const disclaimer = screen.getByRole('link', { name: '/info/disclaimer' });
    expect(disclaimer).toHaveAttribute('href', '/info/disclaimer');
    // Within the site: no new tab.
    expect(disclaimer).not.toHaveAttribute('target');
  });

  it("a member's message keeps the same path as text", () => {
    show({ author: 'mia', authorId: 2, isSystem: false, body: 'see /calls/12' });
    expect(screen.queryByRole('link', { name: '/calls/12' })).toBeNull();
    expect(screen.queryByText('Site')).toBeNull();
  });
});
