// ============================================================
// File:        recordingShare.spec.js
// Path:        client/e2e/recordingShare.spec.js
// Project:     Seasonal Entertainment
// Description: A recording's share link through the real server (docs/CALLS.md, "Sharing a
//              recording"): the server answers /recordings/<id> with the preview card's meta
//              tags and a missing one with 404; a guest opens the page and sees only that
//              recording with its call, and "Share" copies the link ("Link copied"). No egress
//              runs here, so the spec stores a finished recording in the run's database itself.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { ADMIN_STATE } from './adminState.js';
import { E2E_DATABASE } from './members.js';

test('a shared recording link: preview tags, the page, the Share button', async ({
  browser,
  baseURL,
}) => {
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const title = `Share check ${Date.now()}`;
  const call = (await (await api.post('/api/calls', { data: { title } })).json()).call;
  await api.dispose();
  const db = new Database(E2E_DATABASE);
  const id = Number(
    db
      .prepare(
        `INSERT INTO call_recordings (call_id, egress_id, file, started_at, stopped_at,
           started_by, seconds) VALUES (?, 'e2e', 'none.mp4', ?, ?, 'e2eadmin', 754)`
      )
      .run(call.id, '2026-11-10T18:00:00.000Z', '2026-11-10T18:12:34.000Z').lastInsertRowid
  );
  db.close();

  // What a chat app's preview reads: the tags in the page's HTML.
  const crawler = await newRequest.newContext({ baseURL });
  const html = await (await crawler.get(`/recordings/${id}`)).text();
  expect(html).toContain(`<meta property="og:title" content="${title} (recording)" />`);
  expect(html).toContain(`/api/calls/${call.id}/recordings/${id}/video`);
  expect((await crawler.get('/recordings/99999999')).status()).toBe(404);
  await crawler.dispose();

  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  const page = await context.newPage();
  await page.goto(`/recordings/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'To the call' })).toHaveAttribute(
    'href',
    `/calls/${call.id}`
  );
  const item = page.getByRole('list', { name: 'Recording' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('12:34');
  await item.getByRole('button', { name: 'Share' }).click();
  await expect(item.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/recordings/${id}`
  );
  await context.close();
});
