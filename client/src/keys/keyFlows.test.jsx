// ============================================================
// File:        keyFlows.test.jsx
// Path:        client/src/keys/keyFlows.test.jsx
// Project:     Seasonal Entertainment
// Description: A member's key pair in the browser, with real cryptography: registration makes
//              it and offers a recovery code once; "Skip" stores no recovery seal; "Create
//              recovery code" shows the code once (Done only after "I have saved...") and only
//              a seal of the private key reaches the server; a password change carries the same
//              key sealed for the new password; logging out deletes this device's copy.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveAccountKeys,
  deriveRecoveryKey,
  openSealed,
} from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { browserKey, keyServer } from '../test/keyServer.js';
import { deviceEntry, resetDevice } from '../test/memoryDeviceKey.js';
import { GUEST, PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

vi.mock('./deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const PASSWORD = 'correct-horse-1';
const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };

beforeEach(() => resetDevice());

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

// Registers anna through the page; the fake key server learns her auth key from the request.
async function register() {
  const server = keyServer(null);
  const calls = mockApi({
    ...GUEST,
    ...server.answers,
    'POST /auth/register': (sent) => {
      server.state.authKey = sent.authKey;
      server.state.salt = sent.salt;
      return { status: 201, body: { ok: true, user: anna } };
    },
  });
  renderAt('/register');
  type('Username', 'anna');
  type('Email', 'anna@example.org');
  type('Password', PASSWORD);
  fireEvent.click(screen.getByLabelText(/at least 14 years old/));
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  const offer = await screen.findByRole('dialog', { name: 'Protect your private messages' });
  return { server, calls, offer };
}

describe('after registration', () => {
  it('a key pair exists, sealed for the password, and this device holds it', async () => {
    const { server } = await register();
    const { wrapKey } = await deriveAccountKeys(PASSWORD, server.state.salt);
    const opened = await openSealed(server.state.key.sealedPrivateKey, wrapKey);
    expect(opened).toEqual(deviceEntry().privateKey);
    expect(deviceEntry()).toMatchObject({ userId: 1, keyId: server.state.key.keyId });
  });

  it('"Skip" warns, stores no recovery seal and does not ask again', async () => {
    const { server, calls, offer } = await register();
    expect(offer).toHaveTextContent(
      'Without a recovery code, your private messages are lost if you forget your password.'
    );
    fireEvent.click(within(offer).getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(server.state.key.recovery).toBeNull();
    expect(calls.some((c) => c.key === 'PUT /keys/recovery')).toBe(false);
    // Moving on through the site does not bring it back.
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Create recovery code" shows it once; the server gets only a seal', async () => {
    const { server, calls, offer } = await register();
    fireEvent.click(within(offer).getByRole('button', { name: 'Create recovery code' }));
    const code = (await within(offer).findByLabelText('Recovery code')).textContent;
    expect(code).toMatch(/^([A-Z2-9]{5}-){5}[A-Z2-9]{5}$/);
    const done = within(offer).getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    fireEvent.click(within(offer).getByLabelText('I have saved my recovery code'));
    fireEvent.click(done);
    expect(screen.queryByRole('dialog')).toBeNull();

    const sent = JSON.stringify(calls.map((c) => c.body));
    expect(sent).not.toContain(code);
    expect(sent).not.toContain(code.replaceAll('-', ''));
    const { salt, sealed } = server.state.key.recovery;
    const opened = await openSealed(sealed, await deriveRecoveryKey(code, salt));
    expect(opened).toEqual(deviceEntry().privateKey);
  });
});

describe('a signed-in member with an unlocked key', () => {
  async function unlockedAccountPage(extra = {}) {
    const current = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    const { key, privateKey } = await browserKey(current.wrapKey);
    const server = keyServer(current.authKey, key);
    resetDevice({ userId: 1, keyId: key.keyId, privateKey });
    const calls = mockApi({ ...signedIn(anna), ...PRELOGIN, ...server.answers, ...extra });
    renderAt('/account');
    await screen.findByText('Your private messages are unlocked on this device.');
    return { calls, privateKey };
  }

  it('a password change sends the same key, sealed for the new password', async () => {
    const { calls, privateKey } = await unlockedAccountPage({
      'POST /auth/password': { body: { ok: true } },
    });
    type('Current password', PASSWORD);
    type('New password', 'battery-staple-2');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    const { body } = calls.find((c) => c.key === 'POST /auth/password');
    const next = await deriveAccountKeys('battery-staple-2', body.newSalt);
    expect(await openSealed(body.sealedPrivateKey, next.wrapKey)).toEqual(privateKey);
  });

  it('logging out deletes this device copy', async () => {
    await unlockedAccountPage({ 'POST /auth/logout': { body: { ok: true } } });
    expect(deviceEntry()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await vi.waitFor(() => expect(deviceEntry()).toBeNull());
  });
});
