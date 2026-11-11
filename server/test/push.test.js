// ============================================================
// File:        push.test.js
// Path:        server/test/push.test.js
// Project:     Seasonal Entertainment
// Description: Guards the web push "a call has started" (push/, docs/CALLS.md, "Push when a
//              call starts"): members only, a guest is refused; without VAPID keys the key is
//              null and the switch's routes answer 404; turning a device on and off, its state
//              per account; only the browsers' push services as endpoints; starting a call sends
//              each subscribed device an encrypted, VAPID-signed message (a fake push service
//              on 127.0.0.1 receives it) without holding up the start; a subscription the
//              service answers 404 or 410 for is dropped, others stay; a locked member's
//              subscriptions go and nothing is sent to them, a deleted member's go with the
//              account; one made for other keys is dropped, never sent to; the per-account
//              limit; and the keys' configuration.
// ============================================================

import { createServer } from 'node:http';
import webpush from 'web-push';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PUSH_SERVICE_HOSTS as realHosts, readPushConfig } from '../src/push/config.js';
import { callApp, liveCall, organiser } from './helpers/calls.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let service;
let received;
const STATUS = { '/gone': 410, '/missing': 404, '/broken': 500 };

// The fake push service: notes every request, answers 201 or the path's status.
beforeEach(async () => {
  received = [];
  service = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(STATUS[req.url] ?? 201).end();
    });
  });
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
});
afterEach(async () => {
  t?.close();
  await new Promise((resolve) => service.close(resolve));
});

const base = () => `http://127.0.0.1:${service.address().port}`;
const keys = webpush.generateVAPIDKeys();
const pushConfig = () => ({
  ...readPushConfig({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }),
  endpointHosts: ['127.0.0.1'],
  allowHttp: true,
});
const pushApp = (overrides = {}) => ({ push: pushConfig(), ...overrides });

// A browser's subscription: real P-256 keys, so the message can be encrypted for it.
const browserKeys = webpush.generateVAPIDKeys();
const subscription = (path) => ({
  endpoint: `${base()}${path}`,
  keys: { p256dh: browserKeys.publicKey, auth: 'c2l4dGVlbi1ieXRlcy1hdXRo' },
});
const subscribe = (agent, path) => agent.post('/api/push/subscriptions').send(subscription(path));
const status = async (agent, path) =>
  (await agent.post('/api/push/status').send({ endpoint: `${base()}${path}` })).body.subscribed;
const rows = () => t.db.prepare('SELECT endpoint FROM push_subscriptions ORDER BY id').all();
const settle = (count) => expect.poll(() => received.length, { timeout: 5000 }).toBe(count);

describe('the push switch', () => {
  it('members only: a guest is refused', async () => {
    ({ t } = callApp(pushApp()));
    expect((await t.client().get('/api/push')).status).toBe(401);
    expect((await subscribe(t.client(), '/a')).status).toBe(401);
  });

  it('without keys: no public key, and the switch routes answer 404', async () => {
    ({ t } = callApp());
    const { agent } = await registerUser(t, 'mia');
    expect((await agent.get('/api/push')).body.publicKey).toBeNull();
    expect((await subscribe(agent, '/a')).status).toBe(404);
  });

  it('turns a device on and off; its state is per account', async () => {
    ({ t } = callApp(pushApp()));
    const { agent: mia } = await registerUser(t, 'mia');
    const { agent: tom } = await registerUser(t, 'tom');
    expect((await mia.get('/api/push')).body.publicKey).toBe(keys.publicKey);
    expect((await subscribe(mia, '/mia')).status).toBe(201);
    expect(await status(mia, '/mia')).toBe(true);
    expect(await status(tom, '/mia')).toBe(false);
    // The same browser used by another account moves to it.
    await subscribe(tom, '/mia');
    expect([await status(mia, '/mia'), await status(tom, '/mia')]).toEqual([false, true]);
    // Off: only one's own.
    await mia.delete('/api/push/subscriptions').send({ endpoint: `${base()}/mia` });
    expect(await status(tom, '/mia')).toBe(true);
    await tom.delete('/api/push/subscriptions').send({ endpoint: `${base()}/mia` });
    expect(rows()).toEqual([]);
  });

  it('only a push service as the endpoint, over https', async () => {
    // The real list of push services, https only.
    ({ t } = callApp({ push: { ...pushConfig(), endpointHosts: realHosts, allowHttp: false } }));
    const { agent } = await registerUser(t, 'mia');
    const offer = (endpoint) =>
      agent.post('/api/push/subscriptions').send({ ...subscription('/x'), endpoint });
    expect((await offer('https://fcm.googleapis.com/fcm/send/abc')).status).toBe(201);
    expect((await offer('https://updates.push.services.mozilla.com/wpush/v2/abc')).status).toBe(
      201
    );
    for (const endpoint of [
      'https://intranet.example/hook',
      'https://fcm.googleapis.com.evil.example/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'not a url',
    ]) {
      expect((await offer(endpoint)).status, endpoint).toBe(400);
    }
    expect(
      (
        await agent
          .post('/api/push/subscriptions')
          .send({ endpoint: 'https://fcm.googleapis.com/x' })
      ).status
    ).toBe(400);
  });

  it('counts against a limit per account', async () => {
    ({ t } = callApp(pushApp({ rateLimits: { pushSubscribe: { windowMs: 60_000, max: 2 } } })));
    const { agent } = await registerUser(t, 'mia');
    expect((await subscribe(agent, '/a')).status).toBe(201);
    expect((await subscribe(agent, '/a')).status).toBe(201);
    expect((await subscribe(agent, '/a')).status).toBe(429);
  });
});

describe('sending when a call starts', () => {
  it('each subscribed device gets "<title> has started", signed and encrypted', async () => {
    ({ t } = callApp(pushApp()));
    const { agent: mia } = await registerUser(t, 'mia');
    const { agent: tom } = await registerUser(t, 'tom');
    await subscribe(mia, '/mia-phone');
    await subscribe(mia, '/mia-pc');
    await subscribe(tom, '/tom');
    const call = await liveCall(await organiser(t), 'Friday call');
    await settle(3);
    expect(received.map((r) => r.path).sort()).toEqual(['/mia-pc', '/mia-phone', '/tom']);
    for (const request of received) {
      expect(request.headers.authorization).toMatch(/^vapid t=.+, k=/);
      expect(request.headers['content-encoding']).toBe('aes128gcm');
      expect(Number(request.headers.ttl)).toBe(900);
      // Encrypted: the title is nowhere in what travels.
      expect(request.body.toString('latin1')).not.toContain('Friday call');
    }
    expect(call.id).toBeTruthy();
  });

  it('a starting call does not wait for the push service', async () => {
    const slow = createServer(() => {}); // never answers
    await new Promise((resolve) => slow.listen(0, '127.0.0.1', resolve));
    ({ t } = callApp(pushApp()));
    const { agent } = await registerUser(t, 'mia');
    await agent
      .post('/api/push/subscriptions')
      .send({ ...subscription('/x'), endpoint: `http://127.0.0.1:${slow.address().port}/x` });
    const olga = await organiser(t);
    const call = (await olga.post('/api/calls').send({ title: 'Quick' })).body.call;
    const started = Date.now();
    const answer = await olga.post(`/api/calls/${call.id}/start`);
    expect(answer.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
    slow.closeAllConnections();
    await new Promise((resolve) => slow.close(resolve));
  });

  it('drops a subscription the service answers 404 or 410 for, keeps the others', async () => {
    ({ t } = callApp(pushApp()));
    const { agent } = await registerUser(t, 'mia');
    for (const path of ['/gone', '/missing', '/broken', '/fine']) await subscribe(agent, path);
    await liveCall(await organiser(t), 'Call');
    await settle(4);
    await expect
      .poll(() => rows().map((r) => r.endpoint.slice(base().length)))
      .toEqual(['/broken', '/fine']);
  });

  it('nothing for a locked member (their devices go) or a deleted one', async () => {
    ({ t } = callApp(pushApp()));
    const { agent: mia, user: miaUser } = await registerUser(t, 'mia');
    const { agent: tom, user: tomUser } = await registerUser(t, 'tom');
    const { agent: ann } = await registerUser(t, 'ann');
    await subscribe(mia, '/mia');
    await subscribe(tom, '/tom');
    await subscribe(ann, '/ann');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    expect(
      (await admin.post(`/api/admin/users/${miaUser.id}/lock`).send({ locked: true })).status
    ).toBe(200);
    expect(rows().map((r) => r.endpoint)).not.toContain(`${base()}/mia`);
    expect((await admin.delete(`/api/admin/users/${tomUser.id}`)).status).toBe(200);
    expect(rows().map((r) => r.endpoint)).toEqual([`${base()}/ann`]);
    await liveCall(await organiser(t), 'Call');
    await settle(1);
    expect(received[0].path).toBe('/ann');
  });

  it('a subscription made for other keys is dropped, never sent to', async () => {
    ({ t } = callApp(pushApp()));
    const { agent } = await registerUser(t, 'mia');
    await subscribe(agent, '/old');
    await subscribe(agent, '/new');
    t.db
      .prepare(
        "UPDATE push_subscriptions SET vapid_key = 'earlier-key' WHERE endpoint LIKE '%/old'"
      )
      .run();
    await liveCall(await organiser(t), 'Call');
    await settle(1);
    expect(received[0].path).toBe('/new');
    expect(rows().map((r) => r.endpoint)).toEqual([`${base()}/new`]);
  });
});

describe('the push keys', () => {
  it('both or neither, and real P-256 keys', () => {
    expect(readPushConfig({})).toBeNull();
    expect(() => readPushConfig({ VAPID_PUBLIC_KEY: keys.publicKey })).toThrow(/go together/);
    expect(() =>
      readPushConfig({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: keys.privateKey })
    ).toThrow(/not a base64url P-256 key/);
    const https = readPushConfig({
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      PUBLIC_ORIGIN: 'https://site.example',
    });
    expect(https.subject).toBe('https://site.example');
  });
});
