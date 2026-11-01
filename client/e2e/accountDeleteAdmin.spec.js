// ============================================================
// File:        accountDeleteAdmin.spec.js
// Path:        client/e2e/accountDeleteAdmin.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server for an admin deleting an account from
//              Admin -> Users (docs/AUTH.md, "Deleting an account"): the Delete button asks
//              first, naming the account; dismissed, nothing is deleted; accepted, the account
//              leaves the list and the database with its room messages, and the audit log
//              (page and row) names the admin and the deleted account. The admin's own Delete
//              is refused, and the row shows why. Uses a member of its own (members.js
//              addMember), as this spec uses it up, and the run's admin (adminState.js).
// ============================================================

import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { ADMIN, ADMIN_STATE } from './adminState.js';
import { E2E_DATABASE, addMember, memberPage, postInChat, stored } from './members.js';

// The admin's own browser, on the users list filtered to `username`.
async function usersPage(browser, username) {
  const page = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await page.goto('/admin/users');
  await page.getByRole('searchbox').fill(username);
  return page;
}

// Clicks the row's Delete and answers the confirmation; returns the confirmation's text.
async function clickDelete(page, username, accept) {
  const asked = new Promise((resolve) =>
    page.once('dialog', async (dialog) => {
      resolve(dialog.message());
      await (accept ? dialog.accept() : dialog.dismiss());
    })
  );
  await page.getByRole('button', { name: `Delete account for ${username}` }).click();
  return asked;
}

// The audit rows of deletions of `username` (its name is in "before").
function deletionEntries(username) {
  const db = new Database(E2E_DATABASE, { readonly: true });
  try {
    return db
      .prepare(
        "SELECT actor_name AS actor, before FROM audit_log WHERE action = 'user.delete' AND before LIKE ?"
      )
      .all(`%"username":"${username}"%`);
  } finally {
    db.close();
  }
}

test('an admin deletes another account after confirming it', async ({ browser }) => {
  const name = `adel${Date.now().toString(36)}`;
  await addMember(name);
  const { page: member } = await memberPage(browser, name);
  await postInChat(member);
  expect(stored(name)).toEqual({ accounts: 1, messages: 1 });

  const page = await usersPage(browser, name);
  const deleteButton = page.getByRole('button', { name: `Delete account for ${name}` });

  // Dismissed: nothing happens.
  expect(await clickDelete(page, name, false)).toContain(`Delete the account ${name}?`);
  await expect(deleteButton).toBeVisible();
  expect(stored(name)).toEqual({ accounts: 1, messages: 1 });

  // Accepted: the account leaves the list and the database, with its room messages.
  expect(await clickDelete(page, name, true)).toContain(`Delete the account ${name}?`);
  await expect(deleteButton).toHaveCount(0);
  expect(stored(name)).toEqual({ accounts: 0, messages: 0 });

  // The audit log: who deleted which account name.
  expect(deletionEntries(name)).toEqual([
    { actor: ADMIN.username, before: JSON.stringify({ username: name, role: 'member' }) },
  ]);
  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'Audit log' })
    .click();
  const entry = page.getByRole('row').filter({ hasText: 'user.delete' }).filter({ hasText: name });
  await expect(entry).toContainText(ADMIN.username);

  // The deleted member's own page is a guest's from its next request on.
  await member.goto('/account');
  await expect(member).toHaveURL(/\/login/);
});

test("the admin's own Delete is refused, and the row says why", async ({ browser }) => {
  const page = await usersPage(browser, ADMIN.username);
  expect(await clickDelete(page, ADMIN.username, true)).toContain(
    `Delete the account ${ADMIN.username}?`
  );
  const row = page.getByRole('row').filter({ hasText: ADMIN.email });
  await expect(row.getByRole('status')).toHaveText(
    'Delete your own account on your account page, with your password.'
  );
  expect(stored(ADMIN.username).accounts).toBe(1);
});
