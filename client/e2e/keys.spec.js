// ============================================================
// File:        keys.spec.js
// Path:        client/e2e/keys.spec.js
// Project:     Seasonal Entertainment
// Description: A member's key pair in a real browser (docs/CHAT.md, "Keys and the recovery
//              code"): the first login makes it and offers a recovery code once; "Skip" leaves
//              none; a created code is shown once and never sent; this device keeps an
//              unlocked copy in IndexedDB until logout, which deletes it; logging in again
//              unlocks without asking.
// ============================================================

import { expect, test } from '@playwright/test';
import { MEMBER_PASSWORD } from './members.js';
import { recordRequests } from './requestLog.js';

// Whether this browser holds an unlocked key copy (keys/deviceKey.js).
const deviceKeyStored = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('se-keys', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('device');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('device').objectStore('device').get('current');
          get.onsuccess = () => {
            open.result.close();
            resolve(Boolean(get.result));
          };
        };
      })
  );

async function logIn(page, username) {
  await page.goto('/login');
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(username);
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
}

const privateMessages = (page) => page.getByRole('region', { name: 'Private messages' });

test('first login offers a recovery code; "Skip" leaves none', async ({ page }) => {
  await logIn(page, 'keyskip');
  const offer = page.getByRole('dialog', { name: 'Protect your private messages' });
  await expect(offer).toContainText('Without a recovery code, your private messages are lost');
  await offer.getByRole('button', { name: 'Skip' }).click();
  await expect(offer).toBeHidden();
  await expect(privateMessages(page)).toContainText('unlocked on this device');
  await expect(
    privateMessages(page).getByRole('button', { name: 'Create recovery code' })
  ).toBeVisible();
});

test('the recovery code is shown once and never sent; logout removes the device copy', async ({
  page,
}) => {
  const requests = recordRequests(page);
  await logIn(page, 'keycode');
  const offer = page.getByRole('dialog', { name: 'Protect your private messages' });
  await offer.getByRole('button', { name: 'Create recovery code' }).click();
  const code = (await offer.getByLabel('Recovery code', { exact: true }).textContent()).trim();
  await expect(offer.getByRole('button', { name: 'Done' })).toBeDisabled();
  await offer.getByLabel('I have saved my recovery code').check();
  await offer.getByRole('button', { name: 'Done' }).click();
  await expect(offer).toBeHidden();
  await expect(privateMessages(page)).toContainText('You have a recovery code.');
  expect(await deviceKeyStored(page)).toBe(true);

  // A reload keeps the device unlocked.
  await page.reload();
  await expect(privateMessages(page)).toContainText('unlocked on this device');

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect.poll(() => deviceKeyStored(page)).toBe(false);

  // Logging in again opens the key with the password; no new key, no new offer.
  await logIn(page, 'keycode');
  await expect(privateMessages(page)).toContainText('You have a recovery code.');
  await expect(offer).toBeHidden();
  expect(await deviceKeyStored(page)).toBe(true);

  for (const secret of [code, code.replaceAll('-', ''), MEMBER_PASSWORD]) {
    expect(requests.text()).not.toContain(secret);
  }
});
