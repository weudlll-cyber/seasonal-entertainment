// ============================================================
// File:        callFit.spec.js
// Path:        client/e2e/callFit.spec.js
// Project:     Seasonal Entertainment
// Description: Pictures on the call stage with Chrome's fake camera (SE-CALLS-4), at
//              1280 x 720 and 1920 x 1080: a lone speaker's camera shows the whole frame (its
//              drawn aspect equals the track's); in a grid of three speakers every tile crops at
//              most 10% of either dimension; the listener panel with one listener (with its
//              Invite button) has no scrollbar — with real scrollbars, which headless Chrome
//              otherwise hides. A wide, low window (1920 x 700) as well: there a cropping fit
//              would cut a 16:9 camera visibly.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { openCall } from './callPage.js';
import { memberPage } from './members.js';

test.use({
  launchOptions: {
    // Real scrollbars, as on Windows: Playwright's headless Chrome hides them by default.
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

const SIZES = [
  [1280, 720],
  [1920, 1080],
];

// For every camera video on the page: how much of the frame is not visible (0 = none) — what
// its fit cuts away and what the picture box around it clips — and the visible picture's
// aspect against the track's.
const cameras = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('video[aria-label$="camera"]')]
      .filter((v) => v.videoWidth > 0 && !v.classList.contains('stage-spotlight__inset'))
      .map((v) => {
        const box = v.getBoundingClientRect();
        const cover = getComputedStyle(v).objectFit === 'cover';
        const scale = (cover ? Math.max : Math.min)(
          box.width / v.videoWidth,
          box.height / v.videoHeight
        );
        // The drawn frame, centred in the element, then clipped by the picture box.
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        const left = box.left + (box.width - w) / 2;
        const top = box.top + (box.height - h) / 2;
        const clip = v
          .closest('.speaker-tile__picture, .stage-spotlight__main')
          .getBoundingClientRect();
        const seenW = Math.max(0, Math.min(left + w, clip.right) - Math.max(left, clip.left));
        const seenH = Math.max(0, Math.min(top + h, clip.bottom) - Math.max(top, clip.top));
        return {
          name: v.getAttribute('aria-label'),
          crop: 1 - Math.min(seenW / w, seenH / h),
          drawnAspect: seenW / seenH,
          trackAspect: v.videoWidth / v.videoHeight,
        };
      })
  );

const cameraCount = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('video[aria-label$="camera"]')].filter((v) => v.videoWidth > 0)
        .length
  );

test('cameras keep their picture; the listener panel scrolls only when it must', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const call = (await (await api.post('/api/calls', { data: { title: 'Fit' } })).json()).call;
  await api.post(`/api/calls/${call.id}/start`);

  const host = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await openCall(host, call.id);
  await host.getByRole('button', { name: 'Join call' }).click();
  await host.getByRole('button', { name: 'Turn camera on' }).click();
  const one = await memberPage(browser, 'callfit1');
  await openCall(one.page, call.id);
  await one.page.getByRole('button', { name: 'Join call' }).click();

  // One listener, with the organiser's Invite button: no scrollbar in the panel.
  const listeners = host.getByRole('region', { name: 'Listeners' });
  await expect(
    listeners.getByRole('button', { name: 'Invite callfit1 to the stage' })
  ).toBeVisible();
  const overflow = await listeners.evaluate((panel) =>
    [panel, panel.querySelector('.audience__list')].map((el) => {
      const style = getComputedStyle(el);
      const borders = (a, b) => parseFloat(style[a]) + parseFloat(style[b]);
      return {
        down: el.scrollHeight - el.clientHeight,
        across: el.scrollWidth - el.clientWidth,
        // Space a scrollbar takes: the box minus its borders minus the inner size.
        barWidth: el.offsetWidth - borders('borderLeftWidth', 'borderRightWidth') - el.clientWidth,
        barHeight:
          el.offsetHeight - borders('borderTopWidth', 'borderBottomWidth') - el.clientHeight,
      };
    })
  );
  for (const { down, across, barWidth, barHeight } of overflow) {
    expect(down).toBeLessThanOrEqual(0);
    expect(across).toBeLessThanOrEqual(0);
    expect(barWidth).toBe(0);
    expect(barHeight).toBe(0);
  }

  // A lone speaker: the whole frame, at both sizes and in a wide, low window.
  for (const [width, height] of [...SIZES, [1920, 700]]) {
    await one.page.setViewportSize({ width, height });
    await expect.poll(() => cameraCount(one.page)).toBe(1);
    const [lone] = await cameras(one.page);
    expect(lone.crop, `crop at ${width}`).toBeLessThan(0.005);
    expect(Math.abs(lone.drawnAspect - lone.trackAspect)).toBeLessThan(0.01);
  }

  // Three speakers in the grid: at most 10% cut from any tile.
  const two = await memberPage(browser, 'callfit2');
  await openCall(two.page, call.id);
  await two.page.getByRole('button', { name: 'Join call' }).click();
  for (const [member, name] of [
    [one.page, 'callfit1'],
    [two.page, 'callfit2'],
  ]) {
    await listeners.getByRole('button', { name: `Invite ${name} to the stage` }).click();
    await member.getByRole('button', { name: 'Turn camera on' }).click();
  }
  for (const [width, height] of SIZES) {
    await one.page.setViewportSize({ width, height });
    await expect.poll(() => cameraCount(one.page)).toBe(3);
    for (const tile of await cameras(one.page)) {
      expect(tile.crop, `${tile.name} at ${width}`).toBeLessThanOrEqual(0.1);
    }
  }

  await api.post(`/api/calls/${call.id}/end`);
  await api.dispose();
});
