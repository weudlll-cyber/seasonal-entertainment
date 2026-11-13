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
//              account; one made for other keys is dropped, never sent to; at most 10 devices
//              per account, an 11th replacing the one used least recently (turned on, checked
//              by its device, delivered to), and a table from before brought up; sending with
//              a bounded number in flight; the per-account limit; and the keys' configuration.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import webpush from 'web-push';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
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

describe('at most 10 devices per account', () => {
  const endpoints = () => rows().map((r) => r.endpoint.slice(base().length));
  // Each row used at its own time, oldest first (the order they were made in).
  const usedInOrder = () =>
    t.db
      .prepare("UPDATE push_subscriptions SET used_at = '2026-01-01T00:00:' || printf('%02d', id)")
      .run();

  it("an 11th replaces the one used least recently; another account's are not counted", async () => {
    ({ t } = callApp(pushApp()));
    const { agent: mia } = await registerUser(t, 'mia');
    const { agent: tom } = await registerUser(t, 'tom');
    await subscribe(tom, '/tom');
    for (let i = 1; i <= 10; i += 1) await subscribe(mia, `/mia-${i}`);
    expect(rows()).toHaveLength(11);
    usedInOrder();
    // Mia's first device asks whether it is on (the account page): used now.
    expect(await status(mia, '/mia-1')).toBe(true);
    expect((await subscribe(mia, '/mia-11')).status).toBe(201);
    expect(endpoints()).toHaveLength(11);
    expect(endpoints()).toContain('/tom');
    expect(endpoints()).toContain('/mia-1');
    expect(endpoints()).not.toContain('/mia-2');
    // The same device again is no new one: nothing replaced.
    await subscribe(mia, '/mia-11');
    expect(endpoints()).toContain('/mia-3');
  });

  it('a delivered message counts as use', async () => {
    ({ t } = callApp(pushApp()));
    const { agent } = await registerUser(t, 'mia');
    for (let i = 1; i <= 10; i += 1) await subscribe(agent, `/mia-${i}`);
    usedInOrder();
    // The first device's message is refused (500), the others are delivered.
    t.db
      .prepare("UPDATE push_subscriptions SET endpoint = ? WHERE endpoint LIKE '%/mia-2'")
      .run(`${base()}/broken`);
    await liveCall(await organiser(t), 'Call');
    await settle(10);
    await expect
      .poll(
        () =>
          t.db
            .prepare(
              "SELECT COUNT(*) AS n FROM push_subscriptions WHERE used_at LIKE '2026-01-01%'"
            )
            .get().n
      )
      .toBe(1);
    await subscribe(agent, '/new');
    expect(endpoints()).not.toContain('/broken');
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

  it('sends in a bounded number at once, every device still reached', async () => {
    // A push service that holds each request a moment and counts how many are open together.
    const open = { now: 0, most: 0, done: 0 };
    const busy = createServer((req, res) => {
      open.now += 1;
      open.most = Math.max(open.most, open.now);
      req.resume();
      setTimeout(() => {
        open.now -= 1;
        open.done += 1;
        res.writeHead(201).end();
      }, 40);
    });
    await new Promise((resolve) => busy.listen(0, '127.0.0.1', resolve));
    ({ t } = callApp({ push: { ...pushConfig(), sendInFlight: 3 } }));
    for (const name of ['mia', 'tom']) {
      const { agent } = await registerUser(t, name);
      for (let i = 0; i < 6; i += 1) {
        const endpoint = `http://127.0.0.1:${busy.address().port}/${name}-${i}`;
        await agent.post('/api/push/subscriptions').send({ ...subscription('/x'), endpoint });
      }
    }
    await liveCall(await organiser(t), 'Call');
    await expect.poll(() => open.done, { timeout: 5000 }).toBe(12);
    expect(open.most).toBe(3);
    await new Promise((resolve) => busy.close(resolve));
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

it('a table from before the cap gets used_at, each row as used when it was turned on', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'se-push-'));
  const file = path.join(dir, 'old.db');
  try {
    let db = openDatabase(file);
    db.exec(`DROP TABLE push_subscriptions;
      CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        vapid_key TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, vapid_key, created_at)
        VALUES (1, 'https://push.example/a', 'p', 'a', 'k', '2026-11-12T08:00:00.000Z');`);
    db.close();
    db = openDatabase(file);
    expect(db.prepare('SELECT used_at FROM push_subscriptions').get().used_at).toBe(
      '2026-11-12T08:00:00.000Z'
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
