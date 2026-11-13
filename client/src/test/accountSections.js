// ============================================================
// File:        accountSections.js
// Path:        client/src/test/accountSections.js
// Project:     Seasonal Entertainment
// Description: Test helper: opens one of the account page's collapsible sections by its heading
//              button, as a member does (pages/AccountPage.jsx; its name starts with the title,
//              the status line follows). For tests that use a second section next to the one
//              their link (/account#…) opened.
// ============================================================

import { fireEvent, screen } from '@testing-library/react';

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function openSection(title) {
  // The heading's button controls the panel (a form's own button of that name does not).
  const button = (
    await screen.findAllByRole('button', { name: new RegExp(`^${escaped(title)}`) })
  ).find((b) => b.hasAttribute('aria-controls'));
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  return button;
}
