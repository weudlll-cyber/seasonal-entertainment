// ============================================================
// File:        siteBanner.spec.js
// Path:        client/e2e/siteBanner.spec.js
// Project:     Seasonal Entertainment
// Description: The site banner's two styles as the browser draws them (SiteBanner.css), in
//              both themes: info has the winter tint and warning the warning surface, so they
//              differ, and neither is the shell's plain .banner look. The page's session answer
//              is changed in this page only (page.route), so the run's shared settings stay as
//              they are for the tests beside it.
// ============================================================

import { expect, test } from '@playwright/test';

const TEXT = 'A message from the admins';

// The page's session answer, with the banner on in `style`.
async function withBanner(page, style) {
  await page.route('**/api/auth/session', async (route) => {
    const answer = await (await route.fetch()).json();
    const settings = {
      ...answer.settings,
      'banner.enabled': true,
      'banner.text': `${TEXT} (${style})`,
      'banner.link': '',
      'banner.style': style,
    };
    await route.fulfill({ json: { ...answer, settings } });
  });
}

// The banner's background and bottom edge colours, as computed.
async function look(page, style) {
  await withBanner(page, style);
  await page.goto('/games');
  const banner = page.locator('.site-banner');
  await expect(banner).toContainText(`${TEXT} (${style})`);
  return banner.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, edge: css.borderBottomColor };
  });
}

for (const scheme of ['light', 'dark']) {
  test(`info and warning look different (${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    const info = await look(page, 'info');
    const warning = await look(page, 'warning');
    expect(info.background).not.toBe(warning.background);
    expect(info.edge).not.toBe(warning.edge);
    // The tokens each style is meant to use (tokens.css), as this theme resolves them.
    const token = (name) =>
      page.evaluate((n) => {
        const probe = document.createElement('div');
        probe.style.background = `var(${n})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
      }, name);
    expect(info.background).toBe(await token('--color-info-surface'));
    expect(warning.background).toBe(await token('--color-warning-surface'));
    await context.close();
  });
}
