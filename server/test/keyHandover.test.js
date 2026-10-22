// ============================================================
// File:        keyHandover.test.js
// Path:        server/test/keyHandover.test.js
// Project:     Seasonal Entertainment
// Description: Guards unlocking a new device from an unlocked one (keys/handover.js) on a real
//              listening server with the chat's live connection: the request reaches only the
//              account's own pages; confirming hands the new device the private key, sealed to
//              its one-time key (the server accepts nothing else, so it never holds the key
//              unsealed), once, and then the box is gone; reject and expiry hand over nothing;
//              one request at a time; request, confirm and reject are audited without keys.
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newKeyPair,
  openFromDevice,
  sealForDevice,
} from '@seasonal-entertainment/shared/crypto.js';
import { HANDOVER_VALID_MS } from '../src/keys/handover.js';
import { logIn } from './helpers/accountKeys.js';
import { auditActions } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { PASSWORD, memberWithKey } from './helpers/keys.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  vi.useRealTimers();
  sockets.forEach((s) => s.ws.terminate());
  sockets = [];
  await stopServer(server);
  t?.close();
});

// anna's unlocked device (with a live connection), her new device (another session), and bob.
async function devices() {
  ({ t, server } = await listeningChat());
  const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
  const anna = await memberWithKey(t, 'anna');
  const bob = await memberWithKey(t, 'bob');
  const newDevice = t.client();
  await logIn(newDevice, 'anna', PASSWORD);
  const live = (who) => {
    const socket = connect(url, { cookie: cookieOf(who.agent ?? who) });
    sockets.push(socket);
    return socket;
  };
  const annaSocket = live(anna);
  const bobSocket = live(bob);
  await Promise.all([annaSocket.opened, bobSocket.opened]);
  return { anna, bob, newDevice, annaSocket, bobSocket };
}

async function request(newDevice) {
  const deviceKeys = await newKeyPair();
  const res = await newDevice.post('/api/keys/handover').send({ publicKey: deviceKeys.publicKey });
  expect(res.status).toBe(201);
  return { deviceKeys, id: res.body.id };
}

describe('unlocking a new device from an unlocked one', () => {
  it('confirm hands over the key, sealed, once; only her own pages heard of it', async () => {
    const d = await devices();
    const { deviceKeys, id } = await request(d.newDevice);
    const event = await d.annaSocket.next('keyRequest');
    expect(event).toMatchObject({ id, publicKey: deviceKeys.publicKey });
    expect((await d.newDevice.get(`/api/keys/handover/${id}`)).body.status).toBe('pending');
    const sealed = await sealForDevice(d.anna.pair.privateKey, event.publicKey);
    expect(
      (await d.anna.agent.post(`/api/keys/handover/${id}/confirm`).send({ sealed })).status
    ).toBe(200);
    const got = (await d.newDevice.get(`/api/keys/handover/${id}`)).body;
    expect(got.status).toBe('confirmed');
    expect(await openFromDevice(got.sealed, deviceKeys)).toEqual(d.anna.pair.privateKey);
    // Delivered once: the box is gone.
    expect((await d.newDevice.get(`/api/keys/handover/${id}`)).status).toBe(404);
    expect(d.bobSocket.events.some((e) => e.type === 'keyRequest')).toBe(false);
    expect(auditActions(t)).toEqual(
      expect.arrayContaining(['keys.handover_request', 'keys.handover_confirm'])
    );
  });

  it('the server takes only a sealed box: never the key itself', async () => {
    const d = await devices();
    const { id } = await request(d.newDevice);
    const plain = Buffer.from(d.anna.pair.privateKey).toString('base64');
    const res = await d.anna.agent.post(`/api/keys/handover/${id}/confirm`).send({ sealed: plain });
    expect(res.status).toBe(400);
    expect((await d.newDevice.get(`/api/keys/handover/${id}`)).body.status).toBe('pending');
  });

  it('reject hands over nothing', async () => {
    const d = await devices();
    const { id } = await request(d.newDevice);
    expect((await d.anna.agent.post(`/api/keys/handover/${id}/reject`)).status).toBe(200);
    const got = (await d.newDevice.get(`/api/keys/handover/${id}`)).body;
    expect(got).toEqual({ ok: true, status: 'rejected' });
    expect(auditActions(t)).toContain('keys.handover_reject');
  });

  it('after 5 minutes the request is gone: confirming does nothing', async () => {
    const d = await devices();
    vi.useFakeTimers({ toFake: ['Date'] });
    const { deviceKeys, id } = await request(d.newDevice);
    vi.setSystemTime(Date.now() + HANDOVER_VALID_MS + 1000);
    const sealed = await sealForDevice(d.anna.pair.privateKey, deviceKeys.publicKey);
    const late = await d.anna.agent.post(`/api/keys/handover/${id}/confirm`).send({ sealed });
    expect(late.status).toBe(404);
    expect((await d.newDevice.get(`/api/keys/handover/${id}`)).status).toBe(404);
  });

  it('nobody else answers: not another account, not the asking device itself', async () => {
    const d = await devices();
    const { deviceKeys, id } = await request(d.newDevice);
    const sealed = await sealForDevice(d.bob.pair.privateKey, deviceKeys.publicKey);
    expect(
      (await d.bob.agent.post(`/api/keys/handover/${id}/confirm`).send({ sealed })).status
    ).toBe(404);
    expect(
      (await d.newDevice.post(`/api/keys/handover/${id}/confirm`).send({ sealed })).status
    ).toBe(404);
    expect((await d.bob.agent.get(`/api/keys/handover/${id}`)).status).toBe(404);
  });

  it('one request at a time per account; an answered one blocks no other', async () => {
    const d = await devices();
    const { id } = await request(d.newDevice);
    const another = t.client();
    await logIn(another, 'anna', PASSWORD);
    const { publicKey } = await newKeyPair();
    expect((await another.post('/api/keys/handover').send({ publicKey })).status).toBe(409);
    // Rejected, though the first device never came back for the answer.
    await d.anna.agent.post(`/api/keys/handover/${id}/reject`);
    expect((await another.post('/api/keys/handover').send({ publicKey })).status).toBe(201);
  });
});
