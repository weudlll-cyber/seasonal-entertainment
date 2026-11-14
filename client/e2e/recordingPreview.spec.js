// ============================================================
// File:        recordingPreview.spec.js
// Path:        client/e2e/recordingPreview.spec.js
// Project:     Seasonal Entertainment
// Description: Choosing a recording's preview image in a real browser (docs/CALLS.md, "A
//              recording's preview image"), at 1280 and at 390 pixels wide: the admin moves the
//              slider, "Use this frame" takes the frame from the playing video and uploads it,
//              the picker then shows it and the share page's og:image is it; "Back to the logo"
//              brings the logo back. Nothing sticks out of the page at either width. No egress
//              runs here: the spec stores a finished recording with a short test video
//              (fixtures/frames.mp4, VP9, which the test browser plays) itself.
// ============================================================

import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, request as newRequest, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { ADMIN_STATE } from './adminState.js';
import { E2E_DATABASE } from './members.js';

const VIDEO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'frames.mp4');
const RECORDINGS = path.join(process.env.SE_E2E_DIR, 'recordings');

// A finished three-second recording of a new call, its file in the run's recordings folder.
async function storedRecording(baseURL, width) {
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const title = `Preview check ${width} ${Date.now()}`;
  const call = (await (await api.post('/api/calls', { data: { title } })).json()).call;
  await api.dispose();
  const file = `preview-${width}-${Date.now()}.mp4`;
  mkdirSync(RECORDINGS, { recursive: true });
  copyFileSync(VIDEO, path.join(RECORDINGS, file));
  const db = new Database(E2E_DATABASE);
  const id = Number(
    db
      .prepare(
        `INSERT INTO call_recordings (call_id, egress_id, file, started_at, stopped_at,
           started_by, seconds) VALUES (?, 'e2e', ?, ?, ?, 'e2eadmin', 3)`
      )
      .run(call.id, file, '2026-11-14T18:00:00.000Z', '2026-11-14T18:00:03.000Z').lastInsertRowid
  );
  db.close();
  return id;
}

const ogImage = async (baseURL, id) => {
  const crawler = await newRequest.newContext({ baseURL });
  const html = await (await crawler.get(`/recordings/${id}`)).text();
  await crawler.dispose();
  return html.match(/<meta property="og:image" content="([^"]*)" \/>/)?.[1];
};

for (const [width, height] of [
  [1280, 800],
  [390, 844],
]) {
  test(`the preview picker at ${width} px: a frame, then back to the logo`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const id = await storedRecording(baseURL, width);
    const context = await browser.newContext({
      storageState: ADMIN_STATE,
      viewport: { width, height },
    });
    const page = await context.newPage();
    await page.goto(`/recordings/${id}`);
    const picker = page.getByRole('region', { name: 'Preview image' });
    await expect(picker.getByText('The site’s logo')).toBeVisible();
    const video = picker.getByLabel('The frame to use');
    // The browser has the picture once it can show the current frame.
    await expect.poll(() => video.evaluate((element) => element.readyState >= 2)).toBe(true);
    await picker.getByRole('slider').fill('2');
    await expect(picker.getByText('Frame at 0:02')).toBeVisible();
    await expect.poll(() => video.evaluate((element) => !element.seeking)).toBe(true);

    await picker.getByRole('button', { name: 'Use this frame' }).click();
    await expect(picker.getByRole('status')).toHaveText('This frame is now the preview image.');
    await expect(picker.getByText('The chosen image')).toBeVisible();
    await expect(picker.locator('img')).toHaveAttribute(
      'src',
      new RegExp(`^/api/calls/recordings/${id}/preview/thumb\\?v=`)
    );
    // The stored image is a real picture: the browser decoded it.
    await expect
      .poll(() => picker.locator('img').evaluate((img) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    expect(await ogImage(baseURL, id)).toMatch(
      new RegExp(`/api/calls/recordings/${id}/preview/full\\?v=`)
    );
    // Nothing sticks out of the page, and every choice fits beside or under the others.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    for (const name of ['Use this frame', 'Upload an image', 'Back to the logo']) {
      const box = await picker.getByRole('button', { name }).boundingBox();
      expect(box.x + box.width, name).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: testInfo.outputPath(`picker-${width}.png`), fullPage: true });

    await picker.getByRole('button', { name: 'Back to the logo' }).click();
    await expect(picker.getByText('The site’s logo')).toBeVisible();
    expect(await ogImage(baseURL, id)).toMatch(/\/brand\/logo\.webp$/);
    await context.close();
  });
}
