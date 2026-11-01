// ============================================================
// File:        siteBanner.spec.js
// Path:        client/e2e/siteBanner.spec.js
// Project:     Seasonal Entertainment
// Description: The site banner's two styles as the browser draws them (SiteBanner.css), in
//              both themes: info has the winter tint and warning the warning surface, so they
//              differ, and neither is the shell's plain .banner look. The page's session answer
//              is changed in this page only (page.route), so the run's shared settings stay as
//              they are for the tests beside it. The Site banner page (/banner) previews
//              the edited banner in the stored style (info, as the run leaves it); nothing is
//              saved there, for the same reason.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

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

// A colour token (tokens.css) as the page's theme resolves it.
const token = (page, name) =>
  page.evaluate((n) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${n})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, name);

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
    expect(info.background).toBe(await token(page, '--color-info-surface'));
    expect(warning.background).toBe(await token(page, '--color-warning-surface'));
    await context.close();
  });
}

test.describe('the Site banner page', () => {
  // The run's admin: the page is for organisers and admins alike.
  test.use({ storageState: ADMIN_STATE });

  test('its preview follows the edits in the banner style', async ({ page }) => {
    await page.goto('/banner');
    const form = page.getByRole('form', { name: 'Site banner' });
    await form.getByLabel('Banner text').fill(`${TEXT} (preview)`);
    await form.getByLabel('Show the banner').check();
    const preview = page.getByRole('region', { name: 'Preview' }).locator('.site-banner');
    await expect(preview).toContainText(`${TEXT} (preview)`);
    const background = () => preview.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await background()).toBe(await token(page, '--color-info-surface'));
    // On/off and text only: link and style are changed in Admin → Settings.
    await expect(form.getByLabel('Banner style')).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
