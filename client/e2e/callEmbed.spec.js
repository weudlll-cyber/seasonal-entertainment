// ============================================================
// File:        callEmbed.spec.js
// Path:        client/e2e/callEmbed.spec.js
// Project:     Seasonal Entertainment
// Description: The call view inside a game (/embed/call/<id>; docs/GAME-INTEGRATION.md
//              section 9) in a real browser against the run's own LiveKit, under the server's
//              real headers: a page under /games/<slug>/ frames it at 338 x 190 as a game will;
//              a guest listens (the call server confirms the view cannot publish), mutes,
//              collapses to the 48 px column and expands, leaves, listens again and sees the
//              call end; the game hears ready, live, resize and ended. Another page of the site
//              gets only the link to the call page, and another origin cannot frame it at all.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { frameView, messages, participant } from './embeddedCall.js';
import { refused } from './frames.js';
import { DEV_PROXY_URL, SERVER_PORT } from './ports.js';

// As calls.spec.js: the fake media UI also lets Chrome offer its real local addresses (else
// hidden behind mDNS names), which the run's local LiveKit needs to reach the browser. The view
// itself asks for no device.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

test('a game frames the view: listen, mute, collapse, leave, the end', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const call = (await (await api.post('/api/calls', { data: { title: 'Game night' } })).json())
    .call;
  expect((await api.post(`/api/calls/${call.id}/start`)).status()).toBe(200);

  const page = await (await browser.newContext()).newPage();
  await page.goto('/games/test-game/');
  const { frame, element } = await frameView(page, `/embed/call/${call.id}?theme=dark`);
  expect(refused(frame)).toBe(false);
  await expect
    .poll(() => messages(page, 'ready'))
    .toEqual([
      { source: 'seasonal-call', type: 'ready', call: call.id, status: 'live', signedIn: false },
    ]);

  // Sound only after the click inside the frame; a listener, as the call server says.
  const joined = page.waitForResponse((r) => r.url().endsWith(`/api/calls/${call.id}/join`));
  await frame.getByRole('button', { name: 'Listen' }).click();
  const { identity } = await (await joined).json();
  await expect(frame.getByRole('button', { name: 'Leave' })).toBeVisible();
  await expect.poll(async () => Boolean(await participant(identity))).toBe(true);
  expect((await participant(identity)).permission?.canPublish).toBe(false);
  await expect
    .poll(() => messages(page, 'live'))
    .toEqual([{ source: 'seasonal-call', type: 'live', listening: true }]);

  // Mute: the call's sound only; still in the call.
  await frame.getByRole('button', { name: 'Mute the call' }).click();
  await expect(frame.getByRole('button', { name: 'Unmute the call' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  // Collapse to the 48 px column (the game resizes the slot), and back.
  await frame.getByRole('button', { name: 'Collapse' }).click();
  await expect.poll(async () => (await element.boundingBox()).width).toBe(48);
  await expect(frame.getByRole('button', { name: 'Expand' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Unmute the call' })).toBeVisible();
  await frame.getByRole('button', { name: 'Expand' }).click();
  await expect.poll(async () => Math.round((await element.boundingBox()).width)).toBe(338);
  expect((await messages(page, 'resize')).map((m) => m.mode)).toEqual(['collapsed', 'picture']);

  // Leave, then listen again.
  await frame.getByRole('button', { name: 'Leave' }).click();
  await expect(frame.getByText('You left the call.')).toBeVisible();
  await expect.poll(async () => (await messages(page, 'live')).at(-1)?.listening).toBe(false);
  await frame.getByRole('button', { name: 'Listen' }).click();
  await expect(frame.getByRole('button', { name: 'Leave' })).toBeVisible();

  // The organiser ends the call: the view says so, and tells the game.
  expect((await api.post(`/api/calls/${call.id}/end`)).status()).toBe(200);
  await expect(frame.getByText('The call has ended.')).toBeVisible();
  await expect
    .poll(() => messages(page, 'ended'))
    .toEqual([{ source: 'seasonal-call', type: 'ended', reason: 'ended' }]);
  await api.dispose();
});

test('another page of the site gets only the link; another origin cannot frame it', async ({
  page,
}) => {
  await page.goto('/events');
  const { frame } = await frameView(page, '/embed/call/1');
  await expect(frame.getByText("This call view opens inside the site's games.")).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Listen' })).toHaveCount(0);

  await page.goto(`${DEV_PROXY_URL}/games/test-game/`);
  const other = await frameView(page, `http://127.0.0.1:${SERVER_PORT}/embed/call/1`);
  expect(refused(other.frame)).toBe(true);
});
