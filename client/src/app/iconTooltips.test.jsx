// ============================================================
// File:        iconTooltips.test.jsx
// Path:        client/src/app/iconTooltips.test.jsx
// Project:     Seasonal Entertainment
// Description: Buttons that show only an icon tell a mouse user what a click does (title):
//              IconButton (its one label is name and tooltip); a composer button (ChatButton)
//              only where the compact chat hides its text; a menu button showing only "…"
//              (MenuButton's buttonLabel). Buttons with visible text get none. The star and the
//              bell are tested with their chat pages (chatFavourites, mute, userStar).
// ============================================================

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatButton, { ChatVariant } from '../chat/ChatButton.jsx';
import MenuButton from '../chat/MenuButton.jsx';
import IconButton from './IconButton.jsx';

describe('tooltips of icon-only buttons', () => {
  it('IconButton: the label is both the name and the tooltip', () => {
    render(<IconButton label="Close chat" icon="close" />);
    expect(screen.getByRole('button', { name: 'Close chat' })).toHaveAttribute(
      'title',
      'Close chat'
    );
  });

  it('a composer button has one only where its text is hidden (the compact chat)', () => {
    const { unmount } = render(
      <ChatVariant.Provider value="compact">
        <ChatButton icon="send" text="Send" />
      </ChatVariant.Provider>
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('title', 'Send');
    unmount();
    render(<ChatButton icon="send" text="Send" />);
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAttribute('title');
  });

  it('a menu button: "…" gets one, a name shown as text does not', () => {
    render(
      <>
        <MenuButton items={[]} label="Message" buttonLabel="Actions for the message from ann">
          <span aria-hidden="true">…</span>
        </MenuButton>
        <MenuButton items={[]} label="ann">
          ann
        </MenuButton>
      </>
    );
    expect(
      screen.getByRole('button', { name: 'Actions for the message from ann' })
    ).toHaveAttribute('title', 'Actions for the message from ann');
    expect(screen.getByRole('button', { name: 'ann' })).not.toHaveAttribute('title');
  });
});
