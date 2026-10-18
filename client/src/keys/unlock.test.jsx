// ============================================================
// File:        unlock.test.jsx
// Path:        client/src/keys/unlock.test.jsx
// Project:     Seasonal Entertainment
// Description: Unlocking private messages on the account page, with real cryptography: on a
//              new device the password opens the key (a wrong one is told apart from a lost
//              key, never offering "start over"); when the password no longer opens it, the
//              recovery code restores it (sealed again for the current password) and "start
//              over" makes a new key pair and offers a recovery code; an unlocked key can get
//              a new recovery code or lose it, each only with the current password.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveAccountKeys,
  deriveRecoveryKey,
  newRecoveryCode,
  newSalt,
  openSealed,
  sealBytes,
} from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { browserKey, keyServer } from '../test/keyServer.js';
import { deviceEntry, resetDevice } from '../test/memoryDeviceKey.js';
import { PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

vi.mock('./deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const PASSWORD = 'correct-horse-1';
const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };
const OLD_SALT = 'b2xkLXBhc3N3b3JkLXNhbA==';

beforeEach(() => resetDevice());

// The account page for anna, whose current password is PASSWORD (salt PRELOGIN_SALT) and whose
// key is `key` on the server; nothing on this device.
async function accountPage(key) {
  const current = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
  const server = keyServer(current.authKey, key);
  const calls = mockApi({ ...signedIn(anna), ...PRELOGIN, ...server.answers });
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App />
    </MemoryRouter>
  );
  return { server, calls, current };
}

// The account page's "Private messages" section (the page has other password fields).
const section = () => screen.findByRole('region', { name: 'Private messages' });

async function unlockWith(password) {
  const unlock = await within(await section()).findByRole('button', {
    name: 'Unlock private messages',
  });
  const field = within(await section()).getByLabelText('Password');
  fireEvent.change(field, { target: { value: password } });
  fireEvent.click(unlock);
}

describe('a new device', () => {
  it('the password unlocks; a wrong one is only "wrong", never a lost key', async () => {
    const { wrapKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    const { key, privateKey } = await browserKey(wrapKey);
    await accountPage(key);
    await unlockWith('wrong-horse-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('The password is wrong.');
    expect(screen.queryByRole('button', { name: /Start over/ })).toBeNull();
    expect(deviceEntry()).toBeNull();

    await unlockWith(PASSWORD);
    expect(await screen.findByText(/unlocked on this device/)).toBeInTheDocument();
    expect(deviceEntry()).toMatchObject({ userId: 1, keyId: key.keyId, privateKey });
  });
});

describe('when the password no longer opens the key', () => {
  // A key sealed for an old password, as after an admin's password reset.
  async function brokenKey(recovery) {
    const old = await deriveAccountKeys('old-horse-111', OLD_SALT);
    return browserKey(old.wrapKey, 1, recovery);
  }

  it('the recovery code restores it, sealed again for the current password', async () => {
    const code = await newRecoveryCode();
    const salt = await newSalt();
    const { key, privateKey } = await brokenKey(null);
    key.recovery = {
      salt,
      sealed: await sealBytes(privateKey, await deriveRecoveryKey(code, salt)),
    };
    const { server, current } = await accountPage(key);
    await unlockWith(PASSWORD);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not open');

    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'WRONG-CODE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use recovery code' }));
    expect(await screen.findByText('That recovery code is not right.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recovery code'), {
      target: { value: code.toLowerCase() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use recovery code' }));
    expect(await screen.findByText(/unlocked on this device/)).toBeInTheDocument();
    expect(await openSealed(server.state.key.sealedPrivateKey, current.wrapKey)).toEqual(
      privateKey
    );
    expect(deviceEntry().privateKey).toEqual(privateKey);
  });

  it('without a recovery code only "start over" is left: a new key pair', async () => {
    const { key } = await brokenKey(null);
    const { server, current } = await accountPage(key);
    await unlockWith(PASSWORD);
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Recovery code')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start over without my old messages' }));
    expect(
      await screen.findByRole('dialog', { name: 'Protect your private messages' })
    ).toBeInTheDocument();
    expect(server.state.key.keyId).toBe(2);
    expect(server.state.key.publicKey).not.toBe(key.publicKey);
    const opened = await openSealed(server.state.key.sealedPrivateKey, current.wrapKey);
    expect(opened).toEqual(deviceEntry().privateKey);
  });
});

describe('managing the recovery code', () => {
  // The section's own password field (the page has other password fields).
  const typePassword = async (value) =>
    fireEvent.change(within(await section()).getByLabelText('Password for the recovery code'), {
      target: { value },
    });

  it('create one, replace it, remove it — each with the password', async () => {
    const { wrapKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    const { key, privateKey } = await browserKey(wrapKey);
    resetDevice({ userId: 1, keyId: key.keyId, privateKey });
    const { server } = await accountPage(key);
    const create = await screen.findByRole('button', { name: 'Create recovery code' });
    await typePassword(PASSWORD);
    fireEvent.click(create);
    const first = (await screen.findByLabelText('Recovery code')).textContent;
    fireEvent.click(screen.getByLabelText('I have saved my recovery code'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await typePassword(PASSWORD);
    fireEvent.click(await screen.findByRole('button', { name: 'Create a new recovery code' }));
    const second = (await screen.findByLabelText('Recovery code')).textContent;
    expect(second).not.toBe(first);
    const { salt, sealed } = server.state.key.recovery;
    expect(await openSealed(sealed, await deriveRecoveryKey(first, salt))).toBeNull();
    expect(await openSealed(sealed, await deriveRecoveryKey(second, salt))).toEqual(privateKey);
    fireEvent.click(screen.getByLabelText('I have saved my recovery code'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await typePassword(PASSWORD);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove recovery code' }));
    expect(await screen.findByText('Recovery code removed.')).toBeInTheDocument();
    expect(server.state.key.recovery).toBeNull();
    expect(screen.getByRole('button', { name: 'Create recovery code' })).toBeInTheDocument();
  });

  it('without the right password nothing changes', async () => {
    const { wrapKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    const { key, privateKey } = await browserKey(wrapKey);
    resetDevice({ userId: 1, keyId: key.keyId, privateKey });
    const { server } = await accountPage(key);
    fireEvent.click(await screen.findByRole('button', { name: 'Create recovery code' }));
    expect(await screen.findByText('Enter your password first.')).toBeInTheDocument();
    await typePassword('wrong-horse-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create recovery code' }));
    expect(await screen.findByText('The password is wrong.')).toBeInTheDocument();
    expect(server.state.key.recovery).toBeNull();
    expect(screen.queryByLabelText('Recovery code')).toBeNull();
  });
});
