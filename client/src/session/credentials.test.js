// ============================================================
// File:        credentials.test.js
// Path:        client/src/session/credentials.test.js
// Project:     Seasonal Entertainment
// Description: Guards the browser half of the login key split: a normal login sends only the
//              auth key derived with the account's salt; a legacy account sends its password
//              this one time, with a new salt and auth key; a new password gets a fresh salt
//              each time; the wrapping key never travels (it is handed to the keys code).
// ============================================================

import { describe, expect, it } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import { GUEST, PRELOGIN, PRELOGIN_SALT, mockApi } from '../test/mockApi.js';
import { keysForNewPassword, logIn } from './credentials.js';

const PASSWORD = 'correct-horse-1';
const sent = (calls) => JSON.stringify(calls.map((c) => c.body));

describe('logIn', () => {
  it('sends the auth key derived with the account salt, never the password', async () => {
    const calls = mockApi({ ...PRELOGIN, 'POST /auth/login': { body: { ok: true } } });
    const { passwordKeys } = await logIn('anna', PASSWORD);
    const { wrapKey } = passwordKeys;
    const expected = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    expect(calls.map((c) => c.key)).toEqual(['POST /auth/prelogin', 'POST /auth/login']);
    expect(calls[1].body).toEqual({ username: 'anna', authKey: expected.authKey });
    expect(passwordKeys).toEqual(expected);
    expect(sent(calls)).not.toContain(PASSWORD);
    expect(sent(calls)).not.toContain(btoa(String.fromCharCode(...wrapKey)));
  });

  it('upgrades a legacy account: its password once, with a new salt and auth key', async () => {
    const calls = mockApi({
      ...GUEST,
      'POST /auth/prelogin': { body: { ok: true, salt: PRELOGIN_SALT, legacy: true } },
      'POST /auth/legacy-login': { body: { ok: true } },
    });
    await logIn('old', PASSWORD);
    const { body } = calls.find((c) => c.key === 'POST /auth/legacy-login');
    expect(body.password).toBe(PASSWORD);
    expect(body.salt).not.toBe(PRELOGIN_SALT);
    expect(body.authKey).toBe((await deriveAccountKeys(PASSWORD, body.salt)).authKey);
    expect(calls.some((c) => c.key === 'POST /auth/login')).toBe(false);
  });
});

describe('keysForNewPassword', () => {
  it('uses a fresh salt each time', async () => {
    const a = await keysForNewPassword(PASSWORD);
    const b = await keysForNewPassword(PASSWORD);
    expect(a.salt).not.toBe(b.salt);
    expect(a.authKey).not.toBe(b.authKey);
    expect(a.authKey).toBe((await deriveAccountKeys(PASSWORD, a.salt)).authKey);
  });
});
