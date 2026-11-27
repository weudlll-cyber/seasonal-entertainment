// ============================================================
// File:        callShared.spec.js
// Path:        client/e2e/callShared.spec.js
// Project:     Seasonal Entertainment
// Description: The call shared with the games (/embed/call/shared; docs/GAME-INTEGRATION.md
//              section 9) in a real browser against the run's own LiveKit: a page under
//              /games/<slug>/ frames the view once; sharing a call shows it there, unsharing
//              posts ended 'unshared', sharing another posts ready with the new id. A member on
//              the call page who listens in the game stays connected and sees the note, in both
//              orders (the view opened after, or playing before the call page joins); leaving
//              the call page starts the sound in the game.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { openCall } from './callPage.js';
import { frameView, messages, participant } from './embeddedCall.js';
import { memberPage } from './members.js';

// As callEmbed.spec.js: the fake media UI lets Chrome offer its real local addresses, which
// the run's local LiveKit needs.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

const NOTE = "You're in this call in another tab or on another device. The call plays there.";

test('the shared view follows what is shared and leaves a member on the call page alone', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const liveCall = async (title) => {
    const { call } = await (await api.post('/api/calls', { data: { title } })).json();
    expect((await api.post(`/api/calls/${call.id}/start`)).status()).toBe(200);
    return call;
  };
  const share = async (call, shared = true) =>
    expect((await api.put(`/api/calls/${call.id}/shared`, { data: { shared } })).status()).toBe(
      200
    );
  const first = await liveCall('Shared first');
  const second = await liveCall('Shared second');

  const { page: member } = await memberPage(browser, 'sharedmember');
  const game = await member.context().newPage();
  await game.goto('/games/test-game/');
  const { frame } = await frameView(game, '/embed/call/shared?theme=dark');
  const ready = async () => (await messages(game, 'ready')).map((m) => m.call);
  const ended = async () => (await messages(game, 'ended')).map((m) => m.reason);

  await share(first);
  await expect.poll(ready, { timeout: 15_000 }).toEqual([first.id]);
  await share(first, false);
  await expect.poll(ended, { timeout: 15_000 }).toEqual(['unshared']);
  await share(second);
  await expect.poll(ready, { timeout: 15_000 }).toEqual([first.id, second.id]);

  // The member joins on the call page first; then listens in the game.
  await openCall(member, second.id);
  const joined = member.waitForResponse((r) => r.url().endsWith(`/api/calls/${second.id}/join`));
  await member.getByRole('button', { name: 'Join call' }).click();
  const { identity } = await (await joined).json();
  const leave = member.getByRole('button', { name: 'Leave call' });
  await expect(leave).toBeVisible();
  await expect.poll(async () => Boolean(await participant(identity))).toBe(true);
  await frame.getByRole('button', { name: 'Listen' }).click();
  await expect(frame.getByText(NOTE)).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Leave' })).toHaveCount(0);
  // Still in, on the call page, after the view has asked once more.
  await game.waitForResponse((r) => r.url().endsWith(`/api/calls/${second.id}/join`));
  await expect(leave).toBeVisible();

  // Leaving there starts the sound here, as a listener under the member's one identity.
  await leave.click();
  await expect(frame.getByRole('button', { name: 'Leave' })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await participant(identity))?.permission?.canPublish).toBe(false);
  await expect.poll(async () => (await messages(game, 'live')).at(-1)?.listening).toBe(true);

  // The other order: the view is playing, the call page joins and keeps its connection.
  await member.getByRole('button', { name: 'Join call' }).click();
  await expect(frame.getByText(NOTE)).toBeVisible();
  await game.waitForResponse((r) => r.url().endsWith(`/api/calls/${second.id}/join`));
  await expect(leave).toBeVisible();
  await leave.click();
  await expect(frame.getByRole('button', { name: 'Leave' })).toBeVisible({ timeout: 15_000 });

  // The shared call ends; the other one is not shared, so nothing follows it.
  expect((await api.post(`/api/calls/${second.id}/end`)).status()).toBe(200);
  await expect.poll(ended, { timeout: 15_000 }).toEqual(['unshared', 'ended']);
  expect((await api.post(`/api/calls/${first.id}/end`)).status()).toBe(200);
  await member.context().close();
  await api.dispose();
});
