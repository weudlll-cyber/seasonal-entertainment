// ============================================================
// File:        composer.js
// Path:        client/e2e/composer.js
// Project:     Seasonal Entertainment
// Description: Checks the chat module's compact composer as drawn (the drawer and a call's
//              chat share it, SE-CALLS-2): one row — a single-line message field and square
//              icon buttons beside it — and no visible "Message" heading; the texts stay the
//              field's and the buttons' names.
// ============================================================

import { expect } from '@playwright/test';

const middle = (box) => box.y + box.height / 2;

// container: a locator around one compact chat panel.
export async function expectOneRowComposer(container) {
  const field = await container.getByLabel('Message', { exact: true }).boundingBox();
  expect(field.height).toBeLessThanOrEqual(46);
  // The heading is there for screen readers only: clipped to nothing on screen.
  const heading = await container.getByText('Message', { exact: true }).boundingBox();
  expect(heading.width).toBeLessThanOrEqual(1);
  for (const name of [/^Emoji/, 'Send']) {
    const button = await container.getByRole('button', { name }).boundingBox();
    expect(button.width).toBeLessThanOrEqual(46);
    expect(Math.abs(middle(button) - middle(field))).toBeLessThan(6);
  }
}
