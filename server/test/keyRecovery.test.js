// ============================================================
// File:        keyRecovery.test.js
// Path:        server/test/keyRecovery.test.js
// Project:     Seasonal Entertainment
// Description: Guards a member's key when the password changes, with real cryptography: an own
//              change carries the same private key sealed for the new password (and nothing
//              changes on a wrong current password); after an admin's password reset the
//              recovery code restores access, and without one only "start over" is left (a new
//              key pair; the old public key stays on record; an old recovery code goes with
//              the old key).
// ============================================================

import {
  newSalt,
  openSealed,
  sealBytes,
  deriveRecoveryKey,
} from '@seasonal-entertainment/shared/crypto.js';
import { afterEach, describe, expect, it } from 'vitest';
import { browserKeyPair, keysFor, newPasswordBody } from './helpers/accountKeys.js';
import { addRecovery, currentKeyOf as me, memberWithKey } from './helpers/keys.js';
import { makeStaff, makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('when the password changes', () => {
  it('own change: the same key, sealed for the new password, in the same request', async () => {
    t = makeTestApp();
    const { agent, pair, keyId } = await memberWithKey(t);
    const next = await keysFor('battery-staple-2', await newSalt());
    const res = await agent.post('/api/auth/password').send({
      currentAuthKey: pair.authKey,
      newSalt: next.salt,
      newAuthKey: next.authKey,
      sealedPrivateKey: await sealBytes(pair.privateKey, next.wrapKey),
    });
    expect(res.status).toBe(200);
    const key = await me(agent);
    expect(key.keyId).toBe(keyId);
    expect(await openSealed(key.sealedPrivateKey, next.wrapKey)).toEqual(pair.privateKey);
  });

  it('a wrong current password changes neither the password nor the sealed key', async () => {
    t = makeTestApp();
    const { agent, pair } = await memberWithKey(t);
    const before = await me(agent);
    const next = await keysFor('battery-staple-2', await newSalt());
    const res = await agent.post('/api/auth/password').send({
      currentAuthKey: (await keysFor('wrong-horse-1')).authKey,
      newSalt: next.salt,
      newAuthKey: next.authKey,
      sealedPrivateKey: await sealBytes(pair.privateKey, next.wrapKey),
    });
    expect(res.status).toBe(401);
    expect(await me(agent)).toEqual(before);
  });

  it('admin reset with a recovery code: the code restores access', async () => {
    t = makeTestApp();
    const { pair, user, agent: old } = await memberWithKey(t);
    const code = await addRecovery(old, pair.privateKey);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const reset = await newPasswordBody('brand-new-pass-1');
    await admin.post(`/api/admin/users/${user.id}/password`).send(reset).expect(200);

    const agent = t.client();
    await agent.post('/api/auth/login').send({ username: 'anna', authKey: reset.authKey });
    const fresh = await keysFor('brand-new-pass-1', reset.salt);
    const key = await me(agent);
    // The copy sealed with the old password no longer opens with the new one.
    expect(await openSealed(key.sealedPrivateKey, fresh.wrapKey)).toBeNull();
    const recoveryKey = await deriveRecoveryKey(code, key.recovery.salt);
    const privateKey = await openSealed(key.recovery.sealed, recoveryKey);
    expect(privateKey).toEqual(pair.privateKey);
    const sealedPrivateKey = await sealBytes(privateKey, fresh.wrapKey);
    // Sealing it again needs the current password too.
    const wrongPassword = (await keysFor('wrong-horse-1')).authKey;
    expect(
      (await agent.put('/api/keys/sealed').send({ authKey: wrongPassword, sealedPrivateKey }))
        .status
    ).toBe(401);
    const resealed = await agent
      .put('/api/keys/sealed')
      .send({ authKey: fresh.authKey, sealedPrivateKey });
    expect(resealed.status).toBe(200);
    expect(await openSealed((await me(agent)).sealedPrivateKey, fresh.wrapKey)).toEqual(
      pair.privateKey
    );
  });

  it('admin reset without a recovery code: only starting over is left', async () => {
    t = makeTestApp();
    const { user, keyId } = await memberWithKey(t);
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const reset = await newPasswordBody('brand-new-pass-1');
    await admin.post(`/api/admin/users/${user.id}/password`).send(reset).expect(200);
    const agent = t.client();
    await agent.post('/api/auth/login').send({ username: 'anna', authKey: reset.authKey });
    const key = await me(agent);
    expect(key.recovery).toBeNull();
    const fresh = await keysFor('brand-new-pass-1', reset.salt);
    expect(await openSealed(key.sealedPrivateKey, fresh.wrapKey)).toBeNull();

    const pair = await browserKeyPair('brand-new-pass-1', reset.salt);
    const res = await agent.post('/api/keys/replace').send(pair);
    expect(res.status).toBe(200);
    expect(res.body.keyId).not.toBe(keyId);
    const now = await me(agent);
    expect(now).toMatchObject({ keyId: res.body.keyId, publicKey: pair.publicKey, recovery: null });
    // The old public key stays on record (old messages name it); the new one is current.
    const ids = t.db.prepare('SELECT id FROM user_keys WHERE user_id = ? ORDER BY id').all(user.id);
    expect(ids.map((r) => r.id)).toEqual([keyId, res.body.keyId]);
  });

  it('starting over drops the recovery seal: the old code opened only the old key', async () => {
    t = makeTestApp();
    const { agent, pair } = await memberWithKey(t);
    await addRecovery(agent, pair.privateKey);
    const next = await browserKeyPair('correct-horse-1');
    expect((await agent.post('/api/keys/replace').send(next)).status).toBe(200);
    expect((await me(agent)).recovery).toBeNull();
  });
});
