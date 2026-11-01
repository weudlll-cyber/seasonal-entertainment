// ============================================================
// File:        staffBadge.test.jsx
// Path:        client/src/chat/staffBadge.test.jsx
// Project:     Seasonal Entertainment
// Description: Staff in a chat room (ChatMessage.jsx, docs/CHAT.md): an admin's or organiser's
//              message, as the server marks it (authorRole), shows an Admin or Organiser badge
//              and the name in its role's colour (the meta line's role class); a member's, a
//              guest's and the site's own message show no staff badge.
// ============================================================

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatMessage from './ChatMessage.jsx';

vi.mock('../session/SessionContext.jsx', () => ({ useSession: () => ({ user: null }) }));

const show = (fields) =>
  render(
    <ul>
      <ChatMessage
        message={{
          id: 1,
          room: 'general',
          author: 'adele',
          authorId: 2,
          authorRole: null,
          isGuest: false,
          isSystem: false,
          kind: 'text',
          body: 'hello',
          createdAt: '2026-11-01T18:00:00Z',
          media: null,
          file: null,
          preview: null,
          ...fields,
        }}
        moderator={false}
        onAction={() => {}}
      />
    </ul>
  );

// The line with the author's name and badges.
const meta = () => screen.getByRole('listitem').querySelector('.chat-message__meta');

describe('staff badges', () => {
  it.each([
    ['admin', 'Admin'],
    ['organiser', 'Organiser'],
  ])('a message by an %s shows the %s badge and the role colour', (role, badge) => {
    show({ authorRole: role });
    expect(screen.getByText(badge)).toHaveClass('chat-badge', `chat-badge--${role}`);
    expect(meta()).toHaveClass(`chat-message__meta--${role}`);
  });

  it.each([
    ['a member', {}],
    ['a guest', { author: 'Guest-abcdef', authorId: null, isGuest: true }],
    ['the site', { author: 'Seasonal Entertainment', authorId: null, isSystem: true }],
    ['an unknown role', { authorRole: 'member' }],
  ])('a message by %s shows no staff badge', (_who, fields) => {
    show(fields);
    expect(screen.queryByText('Admin')).toBeNull();
    expect(screen.queryByText('Organiser')).toBeNull();
    expect(meta().className).toBe('chat-message__meta');
  });
});
