// ============================================================
// File:        directPicture.spec.js
// Path:        client/e2e/directPicture.spec.js
// Project:     Seasonal Entertainment
// Description: A picture in a direct message is shown, under the real server's headers (the
//              built client, its Content-Security-Policy; docs/ARCHITECTURE.md, "Security
//              headers"): the browser decrypts it and shows it from a blob: address, which the
//              policy's img-src must allow. Without it the picture stayed empty on the live site.
// ============================================================

import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE, memberPage } from './members.js';

const DOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const idOf = (username) => {
  const db = new Database(E2E_DATABASE, { readonly: true });
  try {
    return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
  } finally {
    db.close();
  }
};

const loaded = (image) => image.evaluate((img) => img.complete && img.naturalWidth > 0);

test('a picture in a direct message is shown to both members', async ({ browser }) => {
  // The recipient first: its first login makes the key pair a message is sealed for.
  const recipient = await memberPage(browser, 'picrecip');
  const sender = await memberPage(browser, 'picsender');
  const blocked = [];
  for (const side of [sender, recipient]) {
    side.page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/.test(m.text())) blocked.push(m.text());
    });
  }

  await sender.page.goto(`/chat?direct=${idOf('picrecip')}&name=picrecip`);
  const direct = sender.page.getByRole('region', { name: 'Private messages' });
  await direct.getByLabel('File to attach').setInputFiles({
    name: 'dot.png',
    mimeType: 'image/png',
    buffer: DOT_PNG,
  });
  await expect(direct.getByRole('group', { name: 'Attachment' })).toBeVisible();
  await direct.getByRole('button', { name: 'Send' }).click();
  const mine = direct
    .getByRole('list', { name: 'Private messages with picrecip' })
    .getByRole('img', { name: 'dot.png' });
  await expect(mine).toBeVisible();
  await expect.poll(() => loaded(mine)).toBe(true);

  await recipient.page.goto(`/chat?direct=${idOf('picsender')}&name=picsender`);
  const theirs = recipient.page
    .getByRole('list', { name: 'Private messages with picsender' })
    .getByRole('img', { name: 'dot.png' });
  await expect(theirs).toBeVisible();
  await expect.poll(() => loaded(theirs)).toBe(true);
  expect(await theirs.getAttribute('src')).toMatch(/^blob:/);
  expect(blocked).toEqual([]);
});
