// ============================================================
// File:        accountSections.js
// Path:        client/e2e/accountSections.js
// Project:     Seasonal Entertainment
// Description: Browser test helper: opens one of the account page's collapsible sections by its
//              heading button (client/src/pages/AccountPage.jsx), as a member does, unless it is
//              open already (a link or the browser's memory may have opened it). Its name
//              starts with the title; the status line follows.
// ============================================================

export async function openSection(page, title) {
  const button = page
    .getByRole('button', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
    .and(page.locator('[aria-controls]'));
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
