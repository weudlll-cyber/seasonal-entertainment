// ============================================================
// File:        calls.spec.js
// Path:        client/e2e/calls.spec.js
// Project:     Seasonal Entertainment
// Description: A community call end to end against the run's own LiveKit server, with
//              Chrome's fake camera, microphone and screen (docs/CALLS.md): the organiser
//              starts a call and joins on the stage; a member joins as a listener — the call
//              server confirms they cannot publish — raises a hand, is invited and publishes
//              audio; their fake screen share puts them in the spotlight for a guest listener,
//              who has no hand button; ending the call disconnects everyone.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { RoomServiceClient } from 'livekit-server-sdk';
import { ADMIN_STATE } from './adminState.js';
import { openCall } from './callPage.js';
import { memberPage } from './members.js';
import { CALLS_PORT } from './ports.js';

// Fake devices, no permission prompts, and the whole (fake) screen picked for a share.
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

// What the call server itself says about who may publish (development key pair).
const callServer = new RoomServiceClient(`http://127.0.0.1:${CALLS_PORT}`, 'devkey', 'secret');
const canPublish = async (username) => {
  const rooms = await callServer.listRooms();
  const people = (await Promise.all(rooms.map((r) => callServer.listParticipants(r.name)))).flat();
  return people.find((p) => p.name === username)?.permission?.canPublish;
};

test('organiser, member and guest through one call', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const created = await api.post('/api/calls', { data: { title: 'Town hall' } });
  expect(created.status()).toBe(201);
  const call = (await created.json()).call;
  expect((await api.post(`/api/calls/${call.id}/start`)).status()).toBe(200);

  // The organiser (the run's admin) joins on the stage.
  const host = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await openCall(host, call.id);
  await host.getByRole('button', { name: 'Join call' }).click();
  await expect(host.getByRole('button', { name: 'End call for everyone' })).toBeVisible();

  // A member listens: no publishing controls, and the call server agrees.
  const { page: member } = await memberPage(browser, 'callmember');
  await openCall(member, call.id);
  await member.getByRole('button', { name: 'Join call' }).click();
  await expect(member.getByRole('button', { name: 'Raise hand' })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Microphone' })).toHaveCount(0);
  await expect.poll(() => canPublish('callmember')).toBe(false);

  // Hand up: the organiser sees it first in the list and invites.
  await member.getByRole('button', { name: 'Raise hand' }).click();
  const listeners = host.getByRole('region', { name: 'Listeners' });
  await expect(listeners.getByRole('img', { name: 'Hand raised' })).toBeVisible();
  await listeners.getByRole('button', { name: 'Invite callmember to the stage' }).click();

  // On the stage: the member publishes audio, which the organiser's page shows.
  await member.getByRole('button', { name: 'Microphone' }).click();
  await expect.poll(() => canPublish('callmember')).toBe(true);
  const stage = host.getByRole('region', { name: 'Stage' });
  await expect(
    stage.getByRole('listitem', { name: /^callmember/ }).getByRole('img', { name: 'Microphone on' })
  ).toBeVisible();

  // A guest listens: no hand.
  const guest = await (await browser.newContext()).newPage();
  await openCall(guest, call.id);
  await guest.getByRole('button', { name: 'Join call' }).click();
  await expect(guest.getByRole('button', { name: 'Leave call' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Raise hand' })).toHaveCount(0);

  // The member's (fake) screen share takes the spotlight for the guest.
  await member.getByRole('button', { name: 'Share screen' }).click();
  await member.getByRole('button', { name: 'Share now' }).click();
  await expect(guest.getByText('callmember is sharing the screen')).toBeVisible();

  // Ending the call disconnects everyone.
  await host.getByRole('button', { name: 'End call for everyone' }).click();
  // It asks first.
  await host
    .getByRole('group', { name: 'End the call for everyone' })
    .getByRole('button', { name: 'End call' })
    .click();
  for (const page of [member, guest]) {
    await expect(page.getByText('The call has ended.')).toBeVisible();
  }
  await api.dispose();
});
