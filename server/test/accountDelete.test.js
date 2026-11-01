// ============================================================
// File:        accountDelete.test.js
// Path:        server/test/accountDelete.test.js
// Project:     Seasonal Entertainment
// Description: Guards the rules of deleting an account (docs/AUTH.md, "Deleting an account"):
//              a member deletes only their own account, with the password's auth key and, with
//              2FA on, a code or recovery code (wrong ones refused, nothing deleted); the last
//              active admin can delete itself neither on the account page nor be deleted by the
//              data layer; an admin deletes another account from the user list (audited: who,
//              which account name, when) but not their own there; members cannot use the admin
//              route; the account's open chat sockets close. What the deletion removes:
//              accountDeleteData.test.js.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { deleteAccount } from '../src/accounts/deletion.js';
import { LastAdminError } from '../src/accounts/userAdmin.js';
import { findUserById } from '../src/accounts/userStore.js';
import { enableTwoFactor, savePendingSecret } from '../src/twofa/store.js';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { sealSecret } from '../src/twofa/secretBox.js';
import { proof } from './helpers/accountKeys.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { approveSite, requestToken, tokenAgent } from './helpers/embed.js';
import { STAFF_TOTP_SECRET, makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  server = null;
  t?.close();
});

const PASSWORD = 'correct-horse-1';
const exists = (id) => findUserById(t.db, id) !== null;
const deleteOwn = async (agent, extra = {}, password = PASSWORD) =>
  agent.delete('/api/auth/account').send({ ...(await proof(password)), ...extra });
const currentCode = () => codeForStep(STAFF_TOTP_SECRET, stepAt(Date.now()));

// Turns 2FA on for an account as the setup does; returns its recovery codes.
async function withTwoFactor(userId) {
  savePendingSecret(t.db, userId, await sealSecret(STAFF_TOTP_SECRET, t.config.secretKey));
  return enableTwoFactor(t.db, userId, 0);
}

describe('deleting your own account', () => {
  it('needs the right password; a wrong one deletes nothing', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'anna');
    const wrong = await deleteOwn(agent, {}, 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('invalid_credentials');
    expect(exists(user.id)).toBe(true);
    // A password instead of its auth key never counts.
    const plain = await agent.delete('/api/auth/account').send({ password: PASSWORD });
    expect(plain.status).toBe(400);
    expect(exists(user.id)).toBe(true);

    expect((await deleteOwn(agent)).status).toBe(200);
    expect(exists(user.id)).toBe(false);
    // Logged out: the session is gone, and the name can log in no more.
    expect((await agent.get('/api/auth/session')).body.user).toBeNull();
  });

  it('with 2FA on, needs a valid code or recovery code as well', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'anna');
    const [recoveryCode] = await withTwoFactor(user.id);
    expect((await deleteOwn(agent)).status).toBe(401);
    expect((await deleteOwn(agent, { code: '000000' })).status).toBe(401);
    expect((await deleteOwn(agent, { recoveryCode: 'abcd-efgh' })).status).toBe(401);
    // The right code with a wrong password is refused too.
    expect((await deleteOwn(agent, { code: currentCode() }, 'not-the-password')).status).toBe(401);
    expect(exists(user.id)).toBe(true);
    expect((await deleteOwn(agent, { recoveryCode })).status).toBe(200);
    expect(exists(user.id)).toBe(false);
  });

  it('deletes only the account of the session, whatever the body names', async () => {
    t = makeTestApp();
    const { agent: anna, user: annaUser } = await registerUser(t, 'anna');
    const { user: ben } = await registerUser(t, 'ben', 'ben-password-1');
    // ben's password on anna's session proves nothing.
    expect((await deleteOwn(anna, { userId: ben.id }, 'ben-password-1')).status).toBe(401);
    expect((await deleteOwn(anna, { userId: ben.id, id: ben.id })).status).toBe(200);
    expect(exists(annaUser.id)).toBe(false);
    expect(exists(ben.id)).toBe(true);
    // Guests have no account to delete.
    expect(
      (
        await t
          .client()
          .delete('/api/auth/account')
          .send(await proof(PASSWORD))
      ).status
    ).toBe(401);
  });

  it('the last admin cannot delete itself; with a second admin it can', async () => {
    t = makeTestApp();
    const { agent, user } = await makeStaff(t, 'ada', 'admin');
    // A code is used up by each attempt (no reuse): one recovery code per attempt.
    const codes = enableTwoFactor(t.db, user.id, 0);
    const refused = await deleteOwn(agent, { recoveryCode: codes[0] });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('last_admin');
    expect(exists(user.id)).toBe(true);
    // A locked admin cannot act, so it does not count as another admin.
    const { user: locked } = await makeStaff(t, 'lotte', 'admin');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(locked.id);
    expect((await deleteOwn(agent, { recoveryCode: codes[1] })).status).toBe(409);
    await makeStaff(t, 'bea', 'admin');
    expect((await deleteOwn(agent, { recoveryCode: codes[2] })).status).toBe(200);
    expect(exists(user.id)).toBe(false);
  });

  it('closes every open chat socket of the account', async () => {
    let url;
    ({ t, server, url } = await listeningChat());
    const { agent } = await registerUser(t, 'anna');
    const socket = connect(url, { cookie: cookieOf(agent) });
    await socket.opened;
    expect((await deleteOwn(agent)).status).toBe(200);
    expect(await socket.closed).toBe(4001);
  });

  it('is not open to the embedded chat on other sites', async () => {
    t = makeTestApp();
    await approveSite(t);
    const { agent, user } = await registerUser(t, 'anna');
    const { token } = (await requestToken(agent)).body;
    const res = await tokenAgent(t, token)
      .delete('/api/auth/account')
      .send(await proof(PASSWORD));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('embed_not_allowed');
    expect(exists(user.id)).toBe(true);
  });
});

describe('an admin deleting an account', () => {
  it('deletes another account and writes one audit entry: who, which name, when', async () => {
    t = makeTestApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { user: bert } = await registerUser(t, 'bert');
    expect((await admin.delete(`/api/admin/users/${bert.id}`)).status).toBe(200);
    expect(exists(bert.id)).toBe(false);
    const entries = t.db.prepare('SELECT * FROM audit_log').all();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor_name: 'ada',
      action: 'user.delete',
      target_type: 'user',
      target_id: String(bert.id),
      before: JSON.stringify({ username: 'bert', role: 'member' }),
      after: null,
    });
    expect(entries[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await admin.delete(`/api/admin/users/${bert.id}`)).status).toBe(404);
  });

  it('deletes another admin, but never their own account there', async () => {
    t = makeTestApp();
    const { agent: admin, user: ada } = await makeStaff(t, 'ada', 'admin');
    const { user: bea } = await makeStaff(t, 'bea', 'admin');
    const own = await admin.delete(`/api/admin/users/${ada.id}`);
    expect(own.status).toBe(409);
    expect(own.body.error).toBe('self_delete');
    expect((await admin.delete(`/api/admin/users/${bea.id}`)).status).toBe(200);
    expect(exists(ada.id)).toBe(true);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n).toBe(1);
  });

  it('the data layer refuses to delete the last active admin, and deletes nothing', async () => {
    t = makeTestApp();
    const { user: ada } = await makeStaff(t, 'ada', 'admin');
    expect(() => deleteAccount(t.db, t.config, findUserById(t.db, ada.id))).toThrow(LastAdminError);
    expect(exists(ada.id)).toBe(true);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM two_factor').get().n).toBe(1);
  });

  it('is for admins only', async () => {
    t = makeTestApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { user: bert } = await registerUser(t, 'bert');
    expect((await t.client().delete(`/api/admin/users/${bert.id}`)).status).toBe(401);
    expect((await member.delete(`/api/admin/users/${bert.id}`)).status).toBe(403);
    expect((await organiser.delete(`/api/admin/users/${bert.id}`)).status).toBe(403);
    expect(exists(bert.id)).toBe(true);
  });

  it("closes the deleted account's chat sockets", async () => {
    let url;
    ({ t, server, url } = await listeningChat());
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { agent, user } = await registerUser(t, 'bert');
    const socket = connect(url, { cookie: cookieOf(agent) });
    await socket.opened;
    expect((await admin.delete(`/api/admin/users/${user.id}`)).status).toBe(200);
    expect(await socket.closed).toBe(4001);
  });
});
