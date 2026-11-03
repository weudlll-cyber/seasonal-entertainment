// ============================================================
// File:        stepBadge.test.jsx
// Path:        client/src/chat/stepBadge.test.jsx
// Project:     Seasonal Entertainment
// Description: Discord steps beside a name (variant C; docs/CHAT.md, "Discord steps";
//              SE-DISCORD-1 piece 4): a chat message by an author with steps shows one badge
//              after the staff badge, its tooltip naming every step, opened by a tap too; the
//              neutral placeholder (ladder shape, initials) until an icon exists, then the icon;
//              no badge without steps; the name menu's header with the full names above its
//              items (focus still on the first item); the member search's marks.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatMessage from './ChatMessage.jsx';
import MenuButton from './MenuButton.jsx';
import { StepList, StepMarks, stepInitials } from './StepBadge.jsx';

vi.mock('../session/SessionContext.jsx', () => ({ useSession: () => ({ user: null }) }));

const STEPS = [
  { ladder: 'holder', name: 'Ultimate-Dragon Whale', icon: null },
  { ladder: 'farmer', name: 'Ultimate-Farmer Whale', icon: '/media/step-icons/a.webp' },
  { ladder: 'investor', name: 'Level 4', icon: null },
];

const show = (fields) =>
  render(
    <ul>
      <ChatMessage
        message={{
          id: 1,
          room: 'general',
          author: 'maple',
          authorId: 2,
          authorRole: 'admin',
          isGuest: false,
          isSystem: false,
          kind: 'text',
          body: 'hello',
          createdAt: '2026-11-02T20:14:00Z',
          media: null,
          file: null,
          preview: null,
          authorSteps: STEPS,
          ...fields,
        }}
        moderator={false}
        onAction={() => {}}
      />
    </ul>
  );

describe('the step badge in a chat message', () => {
  it('follows the staff badge, one badge for all steps, its tooltip naming them', () => {
    show({});
    const badge = screen.getByRole('button', { name: /^Discord steps:/ });
    expect(badge).toHaveAccessibleName(
      'Discord steps: Ultimate-Dragon Whale · Ultimate-Farmer Whale · Level 4'
    );
    // After the Admin badge, in the same line.
    const admin = screen.getByText('Admin');
    expect(admin.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(badge).getByRole('tooltip')).toHaveTextContent('Level 4');
  });

  it('opens its tooltip with a tap, and closes it again', () => {
    show({});
    const badge = screen.getByRole('button', { name: /^Discord steps:/ });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(badge).toHaveClass('step-badge--open');
    fireEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the placeholder until an icon exists, then the icon', () => {
    show({});
    const badge = screen.getByRole('button', { name: /^Discord steps:/ });
    const placeholders = badge.querySelectorAll('.step-icon--placeholder');
    expect([...placeholders].map((p) => p.textContent)).toEqual(['UD', '4']);
    expect(placeholders[0]).toHaveClass('step-icon--holder');
    expect(badge.querySelector('img.step-icon')).toHaveAttribute('src', '/media/step-icons/a.webp');
  });

  it('is not there without steps', () => {
    show({ authorSteps: [] });
    expect(screen.queryByRole('button', { name: /^Discord steps:/ })).toBeNull();
  });

  it('makes initials from the step names', () => {
    expect(stepInitials('Ultimate-Dragon Whale')).toBe('UD');
    expect(stepInitials('Farmer Bronze')).toBe('FB');
    expect(stepInitials('Silver')).toBe('S');
    expect(stepInitials('Level 4')).toBe('4');
  });
});

describe('the full names', () => {
  it('head the name menu, above its items, which keep the focus', () => {
    render(
      <MenuButton
        items={[{ label: 'Send private message', run: () => {} }]}
        label="maple"
        header={<StepList steps={STEPS} />}
      >
        maple
      </MenuButton>
    );
    fireEvent.click(screen.getByRole('button', { name: 'maple' }));
    const menu = screen.getByRole('menu', { name: 'maple' });
    expect(within(menu).getByText('Ultimate-Dragon Whale')).toBeInTheDocument();
    expect(within(menu).getByText('· Holder')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Send private message' })).toHaveFocus();
  });

  it('show as marks, nothing to operate, in the member search', () => {
    render(<StepMarks steps={STEPS} />);
    const marks = screen.getByRole('img', { name: /^Discord steps:/ });
    expect(marks).toHaveAttribute(
      'title',
      'Ultimate-Dragon Whale · Ultimate-Farmer Whale · Level 4'
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
