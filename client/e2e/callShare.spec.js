// ============================================================
// File:        callShare.spec.js
// Path:        client/e2e/callShare.spec.js
// Project:     Seasonal Entertainment
// Description: The eye test of 2026-10-18 (SE-CALLS-2): the presenter shared a screen, the
//              server's spotlight update failed, and the listener kept seeing only the
//              presenter's camera. A published screen share must reach every viewer large
//              whether or not the spotlight update succeeds: here the presenter's report of the
//              share fails (500, as it did), and the guest listener still sees the screen.
//              The call's chat uses the chat module's compact composer (one row).
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { openCall } from './callPage.js';
import { expectOneRowComposer } from './composer.js';

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('a screen share shows large even when the spotlight update fails', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const call = (await (await api.post('/api/calls', { data: { title: 'Share test' } })).json())
    .call;
  await api.post(`/api/calls/${call.id}/start`);

  // The presenter (the run's admin, on the stage with the camera on).
  const presenter = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await presenter.route('**/spotlight/share', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: 'server_error',
        message: 'Something went wrong on the server.',
      }),
    })
  );
  await openCall(presenter, call.id);
  await presenter.getByRole('button', { name: 'Join call' }).click();
  await presenter.getByRole('button', { name: 'Turn camera on' }).click();

  const listener = await (await browser.newContext()).newPage();
  await openCall(listener, call.id);
  await listener.getByRole('button', { name: 'Join call' }).click();
  await expect(listener.getByLabel("e2eadmin's camera")).toBeVisible();

  await presenter.getByRole('button', { name: 'Share screen' }).click();
  await presenter.getByRole('button', { name: 'Share now' }).click();
  await expect(listener.getByText('e2eadmin is sharing the screen')).toBeVisible();
  await expect(listener.getByLabel("e2eadmin's screen")).toBeVisible();
  // The call's chat: the same compact composer as the drawer.
  await expectOneRowComposer(listener.getByRole('complementary', { name: 'Call chat' }));
  // The failed report does not trouble the presenter either.
  await expect(presenter.getByText('Something went wrong on the server.')).toHaveCount(0);

  await api.post(`/api/calls/${call.id}/end`);
  await api.dispose();
});
