// ============================================================
// File:        keys.test.js
// Path:        server/test/keys.test.js
// Project:     Seasonal Entertainment
// Description: Guards /api/keys with real cryptography (shared/crypto.js), the browser's part
//              played by the test: the first key pair needs the password; a wrong password or
//              a wrong recovery code cannot open the private key; skipping the recovery code
//              stores no recovery seal; a password can be checked (a typo is not a lost key);
//              the database never holds an unsealed private key, a recovery code or a
//              password; guests have no keys. Password changes and resets: keyRecovery.test.js.
// ============================================================

import {
  deriveRecoveryKey,
  newRecoveryCode,
  newSalt,
  openSealed,
} from '@seasonal-entertainment/shared/crypto.js';
import { afterEach, describe, expect, it } from 'vitest';
import { browserKeyPair, keysFor } from './helpers/accountKeys.js';
import { PASSWORD, addRecovery, currentKeyOf, memberWithKey } from './helpers/keys.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const me = currentKeyOf;

describe('the first key pair', () => {
  it('needs the password, is stored only sealed and only once', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    expect(await me(agent)).toBeNull();
    const pair = await browserKeyPair(PASSWORD);
    const wrong = await keysFor('wrong-horse-1');
    expect((await agent.post('/api/keys').send({ ...pair, authKey: wrong.authKey })).status).toBe(
      401
    );
    expect(await me(agent)).toBeNull();
    expect((await agent.post('/api/keys').send(pair)).status).toBe(201);
    expect((await agent.post('/api/keys').send(pair)).status).toBe(409);

    const key = await me(agent);
    expect(key).toMatchObject({ publicKey: pair.publicKey, recovery: null });
    const { wrapKey } = await keysFor(PASSWORD);
    expect(await openSealed(key.sealedPrivateKey, wrapKey)).toEqual(pair.privateKey);
    // A wrong password cannot open it.
    expect(await openSealed(key.sealedPrivateKey, wrong.wrapKey)).toBeNull();
  });

  it('refuses an unsealed or malformed private key', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const pair = await browserKeyPair(PASSWORD);
    const plain = Buffer.from(pair.privateKey).toString('base64');
    const res = await agent.post('/api/keys').send({ ...pair, sealedPrivateKey: plain });
    expect(res.status).toBe(400);
  });

  it('guests have no keys', async () => {
    t = makeTestApp();
    expect((await t.client().get('/api/keys/me')).status).toBe(401);
    expect((await t.client().post('/api/keys').send({})).status).toBe(401);
  });
});

describe('the recovery code', () => {
  it('is optional: skipping it stores no recovery seal', async () => {
    t = makeTestApp();
    const { agent, user } = await memberWithKey(t);
    expect((await me(agent)).recovery).toBeNull();
    const row = t.db.prepare('SELECT * FROM user_secret_keys WHERE user_id = ?').get(user.id);
    expect(row).toMatchObject({ recovery_salt: null, recovery_sealed: null });
  });

  it('opens the private key; a wrong code does not; a new code replaces the old', async () => {
    t = makeTestApp();
    const { agent, pair } = await memberWithKey(t);
    const code = await addRecovery(agent, pair.privateKey);
    const { recovery } = await me(agent);
    const open = async (c) =>
      openSealed(recovery.sealed, await deriveRecoveryKey(c, recovery.salt));
    expect(await open(code)).toEqual(pair.privateKey);
    expect(await open(await newRecoveryCode())).toBeNull();

    const second = await addRecovery(agent, pair.privateKey);
    const now = (await me(agent)).recovery;
    expect(await openSealed(now.sealed, await deriveRecoveryKey(code, now.salt))).toBeNull();
    expect(await openSealed(now.sealed, await deriveRecoveryKey(second, now.salt))).toEqual(
      pair.privateKey
    );

    const { authKey } = await keysFor(PASSWORD);
    expect((await agent.delete('/api/keys/recovery').send({ authKey })).status).toBe(200);
    expect((await me(agent)).recovery).toBeNull();
  });

  it('cannot be set before there is a key', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const pair = await browserKeyPair(PASSWORD);
    const body = { salt: await newSalt(), sealed: pair.sealedPrivateKey, authKey: pair.authKey };
    expect((await agent.put('/api/keys/recovery').send(body)).status).toBe(404);
  });
});

describe('what the database holds', () => {
  it('never an unsealed private key, a recovery code or a password', async () => {
    t = makeTestApp();
    const { agent, pair, user } = await memberWithKey(t);
    const code = await addRecovery(agent, pair.privateKey);
    const { wrapKey } = await keysFor(PASSWORD);
    const secrets = [
      Buffer.from(pair.privateKey).toString('base64'),
      Buffer.from(pair.privateKey).toString('hex'),
      Buffer.from(wrapKey).toString('base64'),
      code,
      code.replaceAll('-', ''),
      PASSWORD,
    ];
    const dump = t.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .flatMap(({ name }) => t.db.prepare(`SELECT * FROM ${name}`).all())
      .map((row) => JSON.stringify(row))
      .join('\n');
    expect(dump).toContain(pair.publicKey); // the scan does see the keys tables
    for (const secret of secrets) expect(dump).not.toContain(secret);
    // Keys go with the account.
    t.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM user_keys').get().n).toBe(0);
  });
});

describe('checking a password', () => {
  it('tells a wrong password from a right one (a typo is not a lost key)', async () => {
    t = makeTestApp();
    const { agent } = await memberWithKey(t);
    const wrong = await keysFor('wrong-horse-1');
    expect((await agent.post('/api/keys/check').send({ authKey: wrong.authKey })).status).toBe(401);
    const right = await keysFor(PASSWORD);
    expect((await agent.post('/api/keys/check').send({ authKey: right.authKey })).status).toBe(200);
    expect((await t.client().post('/api/keys/check').send({ authKey: right.authKey })).status).toBe(
      401
    );
  });
});

describe('changing the recovery seal needs the password', () => {
  it('set or remove without it or with a wrong one: refused, the seal unchanged', async () => {
    t = makeTestApp();
    const { agent, pair } = await memberWithKey(t);
    const code = await addRecovery(agent, pair.privateKey);
    const before = (await me(agent)).recovery;
    const wrong = (await keysFor('wrong-horse-1')).authKey;
    const replacement = { salt: await newSalt(), sealed: pair.sealedPrivateKey };
    expect((await agent.put('/api/keys/recovery').send(replacement)).status).toBe(400);
    expect(
      (await agent.put('/api/keys/recovery').send({ ...replacement, authKey: wrong })).status
    ).toBe(401);
    expect((await agent.delete('/api/keys/recovery')).status).toBe(400);
    expect((await agent.delete('/api/keys/recovery').send({ authKey: wrong })).status).toBe(401);
    expect((await me(agent)).recovery).toEqual(before);
    // The code still opens it.
    const opened = await openSealed(before.sealed, await deriveRecoveryKey(code, before.salt));
    expect(opened).toEqual(pair.privateKey);
  });
});
