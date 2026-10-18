// ============================================================
// File:        callLayout.spec.js
// Path:        client/e2e/callLayout.spec.js
// Project:     Seasonal Entertainment
// Description: The call page's use of space (SE-CALLS-3) with Chrome's fake screen share, at
//              1280 x 720 and 1920 x 1080: the share is never cropped (object-fit contain, its
//              drawn picture keeps the track's aspect and lies inside the stage), the main
//              column does not scroll, the control bar is one row. The sidebar is a rail that
//              a pointer slides open over the stage (which does not move) and that is gone on
//              other pages; the collapsed call chat stays collapsed after a reload; the
//              full-screen button calls the Fullscreen API; a raised hand shows while the
//              listener panel is collapsed.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

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

// The drawn picture of a video with object-fit contain, and the boxes around it.
const measure = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[aria-label="e2eadmin\'s screen"]');
    const stage = document.querySelector('section.stage').getBoundingClientRect();
    const box = video.getBoundingClientRect();
    const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    const drawn = { width: video.videoWidth * scale, height: video.videoHeight * scale };
    const main = document.querySelector('.shell__main');
    const tops = [...document.querySelectorAll('.call-control')].map((b) =>
      Math.round(b.getBoundingClientRect().top)
    );
    return {
      fit: getComputedStyle(video).objectFit,
      trackAspect: video.videoWidth / video.videoHeight,
      drawnAspect: drawn.width / drawn.height,
      inside:
        box.left >= stage.left - 1 &&
        box.right <= stage.right + 1 &&
        box.top >= stage.top - 1 &&
        box.bottom <= stage.bottom + 1 &&
        drawn.width <= box.width + 1 &&
        drawn.height <= box.height + 1,
      mainScrolls: main.scrollHeight > main.clientHeight + 1,
      rows: new Set(tops).size,
    };
  });

test('the stage gets the room; rail, chat tab, full screen, raised hands', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const call = (await (await api.post('/api/calls', { data: { title: 'Layout' } })).json()).call;
  await api.post(`/api/calls/${call.id}/start`);

  const host = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await host.goto(`/calls/${call.id}`);
  await host.getByRole('button', { name: 'Join call' }).click();
  await host.getByRole('button', { name: 'Camera' }).click();
  const { page: member } = await memberPage(browser, 'calllayout');
  await member.goto(`/calls/${call.id}`);
  await member.getByRole('button', { name: 'Join call' }).click();
  await host.getByRole('button', { name: 'Share screen' }).click();
  await host.getByRole('button', { name: 'Share now' }).click();

  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ]) {
    await member.setViewportSize({ width, height });
    await expect(member.getByText('e2eadmin is sharing the screen')).toBeVisible();
    await expect
      .poll(() =>
        member.evaluate(
          () => document.querySelector('video[aria-label$="screen"]')?.videoWidth ?? 0
        )
      )
      .toBeGreaterThan(0);
    const m = await measure(member);
    expect(m.fit, `at ${width}`).toBe('contain');
    expect(Math.abs(m.drawnAspect - m.trackAspect)).toBeLessThan(0.01);
    expect(m.inside, `share inside the stage at ${width}`).toBe(true);
    expect(m.mainScrolls, `main column scrolls at ${width}`).toBe(false);
    expect(m.rows, `control bar rows at ${width}`).toBe(1);
  }

  // The rail: narrow; a pointer slides the full menu over the stage, which does not move.
  await member.setViewportSize({ width: 1280, height: 720 });
  const rail = member.locator('header.sidebar');
  const stage = member.getByRole('region', { name: 'Stage' });
  const stageBox = await stage.boundingBox();
  expect((await rail.boundingBox()).width).toBeLessThan(90);
  await rail.hover();
  await expect.poll(async () => (await rail.boundingBox()).width).toBeGreaterThan(200);
  expect(await stage.boundingBox()).toEqual(stageBox);
  await member.mouse.move(900, 400);
  await expect.poll(async () => (await rail.boundingBox()).width).toBeLessThan(90);

  // Full screen: the button asks the browser for it.
  await member.evaluate(() => {
    window.fullscreenCalls = 0;
    HTMLElement.prototype.requestFullscreen = function () {
      window.fullscreenCalls += 1;
      return Promise.resolve();
    };
  });
  await member.getByRole('button', { name: 'Full screen' }).click();
  expect(await member.evaluate(() => window.fullscreenCalls)).toBe(1);

  // The organiser sees a raised hand in the collapsed listener panel.
  await member.getByRole('button', { name: 'Raise hand' }).click();
  const listeners = host.getByRole('region', { name: 'Listeners' });
  await expect(listeners.getByRole('img', { name: 'Hand raised' })).toBeVisible();
  await expect(listeners.getByRole('searchbox')).toHaveCount(0);
  // Collapsed: one row of chips.
  const tops = await listeners
    .locator('.audience-chip')
    .evaluateAll((chips) => chips.map((c) => Math.round(c.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  // The chat collapsed stays so after a reload.
  await member.getByRole('button', { name: 'Collapse the call chat' }).click();
  await member.reload();
  await expect(member.getByRole('button', { name: /^Show the call chat/ })).toBeVisible();

  // Other pages: the normal sidebar.
  await member.goto('/calls');
  await expect.poll(async () => (await rail.boundingBox()).width).toBeGreaterThan(200);

  await api.post(`/api/calls/${call.id}/end`);
  await api.dispose();
});
