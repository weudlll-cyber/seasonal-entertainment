// ============================================================
// File:        deviceHandover.test.jsx
// Path:        client/src/keys/deviceHandover.test.jsx
// Project:     Seasonal Entertainment
// Description: Unlocking a new device from an unlocked one, with real cryptography
//              (DeviceUnlock, DeviceRequestPrompt): the new device shows the code of its
//              one-time key and, once the other device confirmed, opens the sealed key and keeps
//              it on this device; reject, expiry and a key that is not the account's unlock
//              nothing. The unlocked device asks with the same code; Confirm sends the key only
//              sealed to the one-time key, Reject sends nothing; a locked device is not asked.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveAccountKeys,
  handoverCode,
  newKeyPair,
  openFromDevice,
  sealForDevice,
} from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { browserKey, keyServer } from '../test/keyServer.js';
import { deviceEntry, resetDevice } from '../test/memoryDeviceKey.js';
import { PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

vi.mock('./deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };

beforeEach(() => {
  resetDevice();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

// anna's key on the server; answer(sentPublicKey): what GET /keys/handover/h1 says, given the
// one-time public key the device sent.
async function newDevice(answer) {
  const { wrapKey } = await deriveAccountKeys('correct-horse-1', PRELOGIN_SALT);
  const { key, privateKey } = await browserKey(wrapKey);
  const server = keyServer('unused', key);
  let sentPublicKey;
  const calls = mockApi({
    ...signedIn(anna),
    ...PRELOGIN,
    ...server.answers,
    'POST /keys/handover': (sent) => {
      sentPublicKey = sent.publicKey;
      return { status: 201, body: { ok: true, id: 'h1', expiresAt: Date.now() + 300_000 } };
    },
    'GET /keys/handover/h1': async () => answer(sentPublicKey, privateKey),
  });
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App />
    </MemoryRouter>
  );
  const region = await screen.findByRole('region', { name: 'Private messages' });
  fireEvent.click(await within(region).findByRole('button', { name: 'Confirm on another device' }));
  fireEvent.click(within(region).getByRole('button', { name: 'Ask my other device' }));
  const code = await within(region).findByText(/^\d{3} \d{3}$/);
  return { key, privateKey, calls, region, code, sentPublicKey: () => sentPublicKey };
}

describe('the new device', () => {
  it('shows the code of its one-time key; once confirmed, the key is open here', async () => {
    let tries = 0;
    const device = await newDevice(async (publicKey, privateKey) => {
      tries += 1;
      if (tries === 1) return { body: { ok: true, status: 'pending' } };
      return {
        body: { ok: true, status: 'confirmed', sealed: await sealForDevice(privateKey, publicKey) },
      };
    });
    expect(device.code).toHaveTextContent(await handoverCode(device.sentPublicKey()));
    expect(await screen.findByText(/unlocked on this device/, {}, { timeout: 8000 })).toBeVisible();
    expect(deviceEntry()).toMatchObject({ userId: 1, keyId: device.key.keyId });
    expect(deviceEntry().privateKey).toEqual(device.privateKey);
  }, 15_000);

  it.each([
    ['rejected', { body: { ok: true, status: 'rejected' } }, 'Rejected on your other device.'],
    ['expired', { status: 404, body: { ok: false, message: 'gone' } }, 'The request expired.'],
  ])(
    '%s: nothing is unlocked',
    async (_what, reply, text) => {
      const device = await newDevice(async () => reply);
      expect(
        await within(device.region).findByText(new RegExp(text), {}, { timeout: 8000 })
      ).toBeVisible();
      expect(deviceEntry()).toBeNull();
    },
    15_000
  );

  it("a key that is not the account's is refused", async () => {
    const stranger = await newKeyPair();
    const device = await newDevice(async (publicKey) => ({
      body: {
        ok: true,
        status: 'confirmed',
        sealed: await sealForDevice(stranger.privateKey, publicKey),
      },
    }));
    expect(
      await within(device.region).findByText(/did not fit/, {}, { timeout: 8000 })
    ).toBeVisible();
    expect(deviceEntry()).toBeNull();
  }, 15_000);
});

describe('the unlocked device', () => {
  // anna with her key open on this device; returns the calls and the key.
  async function unlockedPage() {
    const { wrapKey } = await deriveAccountKeys('correct-horse-1', PRELOGIN_SALT);
    const { key, privateKey } = await browserKey(wrapKey);
    resetDevice({ userId: 1, keyId: key.keyId, privateKey });
    const calls = mockApi({
      ...signedIn(anna),
      ...keyServer('unused', key).answers,
      'POST /keys/handover/h1/confirm': { body: { ok: true } },
      'POST /keys/handover/h1/reject': { body: { ok: true } },
      'GET /calls/summary': { body: { ok: true, configured: false, live: false } },
      'GET /chat/unread': { body: { ok: true, rooms: [], direct: [] } },
    });
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App />
      </MemoryRouter>
    );
    await screen.findByText(/unlocked on this device/);
    await vi.waitFor(() => expect(FakeSocket.all.length).toBeGreaterThan(0));
    return { calls, privateKey };
  }
  const ask = async (deviceKeys) =>
    act(() =>
      FakeSocket.all.at(-1).push({
        type: 'keyRequest',
        id: 'h1',
        publicKey: deviceKeys.publicKey,
        expiresAt: Date.now() + 300_000,
      })
    );

  it('asks with the same code; Confirm sends the key sealed to the new device only', async () => {
    const { calls, privateKey } = await unlockedPage();
    const deviceKeys = await newKeyPair();
    await ask(deviceKeys);
    const dialog = await screen.findByRole('dialog', { name: 'A new device wants access' });
    expect(dialog).toHaveTextContent(
      `A new device wants access to your direct messages — code ${await handoverCode(deviceKeys.publicKey)}. Is this you?`
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /keys/handover/h1/confirm')).toBe(true)
    );
    const { sealed } = calls.find((c) => c.key === 'POST /keys/handover/h1/confirm').body;
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain(
      btoa(String.fromCharCode(...privateKey))
    );
    expect(await openFromDevice(sealed, deviceKeys)).toEqual(privateKey);
    expect(screen.queryByRole('dialog', { name: 'A new device wants access' })).toBeNull();
  });

  it('a device where the key is locked is not asked', async () => {
    const { wrapKey } = await deriveAccountKeys('correct-horse-1', PRELOGIN_SALT);
    const { key } = await browserKey(wrapKey);
    mockApi({
      ...signedIn(anna),
      ...keyServer('unused', key).answers,
      'GET /calls/summary': { body: { ok: true, configured: false, live: false } },
      'GET /chat/unread': { body: { ok: true, rooms: [], direct: [] } },
    });
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'Unlock private messages' });
    await vi.waitFor(() => expect(FakeSocket.all.length).toBeGreaterThan(0));
    await ask(await newKeyPair());
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(screen.queryByRole('dialog', { name: 'A new device wants access' })).toBeNull();
  });

  it('Reject sends nothing of the key', async () => {
    const { calls } = await unlockedPage();
    await ask(await newKeyPair());
    const dialog = await screen.findByRole('dialog', { name: 'A new device wants access' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /keys/handover/h1/reject')).toBe(true)
    );
    expect(calls.some((c) => c.key === 'POST /keys/handover/h1/confirm')).toBe(false);
  });
});
