// ============================================================
// File:        frames.js
// Path:        client/e2e/frames.js
// Project:     Seasonal Entertainment
// Description: Browser-test helpers for the embedded chat (docs/EMBED.md): putting an iframe
//              into the page a test is on (the host page of a game site), and telling whether
//              the browser refused to show it (frame-ancestors).
// ============================================================

import { expect } from '@playwright/test';

// Puts an iframe of `src` into the current page; returns its frame once it has loaded.
export async function frameOf(page, src) {
  await page.evaluate((url) => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'framed';
    frame.style.height = '40rem';
    document.body.append(frame);
  }, src);
  const element = page.locator('iframe[title="framed"]').last();
  await expect(element).toBeAttached();
  const frame = await (await element.elementHandle()).contentFrame();
  await frame.waitForLoadState();
  return frame;
}

// A frame the browser refused to show (frame-ancestors) ends on its error page.
export const refused = (frame) => frame.url().startsWith('chrome-error://');
