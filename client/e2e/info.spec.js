// ============================================================
// File:        info.spec.js
// Path:        client/e2e/info.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server: the admin writes an info page (with a
//              <script> in it), checks the preview, publishes it; a guest finds it under /info,
//              sees the Markdown rendered and the script inert. A draft stays invisible. Beside
//              a long preview, the editor's "Save" keeps a button's normal height.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

test('an admin publishes a page; a guest reads it, with HTML inert', async ({ page, browser }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const editor = await admin.newPage();
  await editor.goto('/admin/info/new');
  await editor.getByLabel('Address').fill(slug);
  await editor.getByLabel('Title').fill('E2E page');
  await editor
    .getByLabel('Text (Markdown)')
    .fill('## Section\n\nSome **bold** text.\n\n<script>window.__xss = 1</script>');
  await expect(editor.getByRole('region', { name: 'Preview' }).locator('h2')).toHaveText('Section');
  await editor.getByRole('button', { name: 'Save' }).click();

  // Still a draft: the public does not see it.
  const draft = await page.request.get(`/api/info/${slug}`);
  expect(draft.status()).toBe(404);

  await editor.getByRole('button', { name: 'Publish' }).click();
  await expect(editor.getByText('Published: visible to everyone.')).toBeVisible();
  await admin.close();

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/info');
  await page.getByRole('link', { name: 'E2E page' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Section');
  await expect(page.locator('strong')).toHaveText('bold');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('article script').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('beside a long preview, "Save" keeps the height of the other buttons', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const editor = await admin.newPage();
  await editor.setViewportSize({ width: 1440, height: 900 }); // form and preview side by side
  await editor.goto('/admin/info/new');
  await editor.getByLabel('Address').fill(`e2e-tall-${Date.now().toString(36)}`);
  await editor.getByLabel('Title').fill('E2E long page');
  // Far taller as a preview than the form beside it.
  const body = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of a long page.`);
  await editor.getByLabel('Text (Markdown)').fill(body.join('\n\n'));
  await editor.getByRole('button', { name: 'Save' }).click();
  const publish = editor.getByRole('button', { name: 'Publish' });
  await expect(publish).toBeVisible();
  const height = async (button) => (await button.boundingBox()).height;
  expect(await height(editor.getByRole('button', { name: 'Save' }))).toBe(await height(publish));
  await admin.close();
});
