// ============================================================
// File:        callPage.js
// Path:        client/e2e/callPage.js
// Project:     Seasonal Entertainment
// Description: Opens a call's page for a browser test with the pointer resting over the stage.
//              On a call page the sidebar is an icon rail that a resting pointer slides open
//              over the page (as designed); Playwright's pointer starts at (0, 0) — on the rail
//              — and its clicks move straight to their target, so an open rail would cover the
//              left edge of the page ("Join call") for good. A person moves the pointer away;
//              the test does the same.
// ============================================================

// page: a Playwright page; reload: open the page again (it is open already).
export async function openCall(page, callId, { reload = false } = {}) {
  if (reload) await page.reload();
  else await page.goto(`/calls/${callId}`);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width * 0.6, height * 0.5);
}
