// ============================================================
// File:        frames.js
// Path:        client/e2e/frames.js
// Project:     Seasonal Entertainment
// Description: Browser-test helpers for the embedded chat (docs/EMBED.md): putting an iframe
//              into the page a test is on (the host page of a game site), in view without any
//              scrolling, and telling whether the browser refused to show it (frame-ancestors).
// ============================================================

import { expect } from '@playwright/test';

// Puts an iframe of `src` into the current page, in view in its top-left corner and above the
// page, as a game site shows its chat; returns its frame once it has loaded. Not appended in the
// flow: the host pages are this site's own, whose body never scrolls (styles/base.css), so the
// frame would sit below the window, and every click in it would first need that body scrolled,
// while the page under it keeps changing with what the other tests do.
export async function frameOf(page, src) {
  await page.evaluate((url) => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'framed';
    Object.assign(frame.style, { position: 'fixed', top: '0', left: '0', zIndex: '100' });
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
