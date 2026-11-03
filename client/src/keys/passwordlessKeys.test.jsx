// ============================================================
// File:        passwordlessKeys.test.jsx
// Path:        client/src/keys/passwordlessKeys.test.jsx
// Project:     Seasonal Entertainment
// Description: Private messages of an account without a password (made with Discord;
//              docs/CHAT.md, "Accounts without a password"; SE-DISCORD-1 piece 5), with real
//              cryptography: without a fresh Discord login it asks to confirm with Discord first;
//              then the plain choice: "Save a recovery code" (a key pair sealed by the code alone,
//              sent with its recovery seal, the code shown once and not skippable) or "Set a
//              password" (the first password, then the key pair sealed for it and the
//              recovery-code offer); on a device without the key, the recovery code opens it.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveAccountKeys,
  deriveRecoveryKey,
  newKeyPair,
  newSalt,
  openSealed,
  sealBytes,
} from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { PASSWORDS_DIFFER } from '../components/RepeatPasswordField.jsx';
import { deviceEntry, resetDevice } from '../test/memoryDeviceKey.js';
import { mockApi, signedIn, withFeatures } from '../test/mockApi.js';

vi.mock('./deviceKey.js', () => import('../test/memoryDeviceKey.js'));

beforeEach(() => resetDevice());

const soon = () => new Date(Date.now() + 5 * 60_000).toISOString();
const weudlll = (fields = {}) =>
  withFeatures(
    signedIn({
      id: 7,
      username: 'weudlll',
      role: 'member',
      email: null,
      hasPassword: false,
      discordProofUntil: soon(),
      ...fields,
    }),
    { discord: true }
  );

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
// The account page's "Private messages" section (the page has another "Set a password").
const privateMessages = () => screen.findByRole('region', { name: 'Private messages' });

// The keys routes for an account without a password: no auth key asked (the server checks the
// Discord proof). state.key: what GET /keys/me returns.
function keys(key = null) {
  const state = { key, sent: [] };
  return {
    state,
    answers: {
      'GET /keys/me': () => ({ body: { ok: true, key: state.key } }),
      'POST /keys': (sent) => {
        state.sent.push(sent);
        state.key = {
          keyId: 1,
          publicKey: sent.publicKey,
          sealedPrivateKey: sent.sealedPrivateKey,
          recovery: sent.recovery ?? null,
        };
        return { status: 201, body: { ok: true, keyId: 1 } };
      },
    },
  };
}

describe('before the first private message', () => {
  it('asks to confirm with Discord first when the proof is missing', async () => {
    const server = keys();
    mockApi({ ...weudlll({ discordProofUntil: null }), ...server.answers });
    renderAt('/account');
    const confirm = await screen.findAllByRole('link', { name: 'Confirm with Discord' });
    expect(confirm[0]).toHaveAttribute(
      'href',
      '/api/auth/discord/start?intent=confirm&next=%2Faccount'
    );
    expect(screen.queryByRole('button', { name: 'Save a recovery code' })).toBeNull();
  });

  it('on the chat page, the confirmation comes back to the Direct tab', async () => {
    mockApi({ ...weudlll({ discordProofUntil: null }), ...keys().answers });
    const { unmount } = renderAt('/chat');
    // Rooms by default; the Direct tab goes into the address and so into the way back.
    expect(await screen.findByRole('tab', { name: /Rooms/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.click(screen.getByRole('tab', { name: /Direct/ }));
    const confirm = await screen.findByRole('link', { name: 'Confirm with Discord' });
    const next = new URL(confirm.getAttribute('href'), 'http://x').searchParams.get('next');
    expect(next).toBe('/chat?tab=direct');
    unmount();
    // Back from Discord: the same address opens the Direct tab again.
    renderAt(next);
    expect(await screen.findByRole('tab', { name: /Direct/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('"Save a recovery code": the key sealed by the code alone, the code shown once', async () => {
    const server = keys();
    mockApi({ ...weudlll(), ...server.answers });
    renderAt('/account');
    const section = await privateMessages();
    fireEvent.click(await within(section).findByRole('button', { name: 'Save a recovery code' }));
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Protect your private messages' },
      { timeout: 20_000 }
    );
    const code = within(dialog).getByLabelText('Recovery code').textContent;
    // No way to skip: the code is the only way back to these messages.
    expect(within(dialog).queryByRole('button', { name: 'Skip' })).toBeNull();
    const [sent] = server.state.sent;
    expect(sent.sealedPrivateKey).toBe(sent.recovery.sealed);
    expect(sent.authKey).toBeUndefined();
    const opened = await openSealed(
      sent.recovery.sealed,
      await deriveRecoveryKey(code, sent.recovery.salt)
    );
    expect(opened).toEqual(deviceEntry().privateKey);
  });

  it('"Set a password": the first password, then the key sealed for it', async () => {
    const server = keys();
    let first;
    const calls = mockApi({
      ...weudlll(),
      ...server.answers,
      'POST /auth/password/first': (sent) => {
        first = sent;
        return { body: { ok: true } };
      },
    });
    renderAt('/account');
    const section = await privateMessages();
    const button = await within(section).findByRole('button', { name: 'Set a password' });
    const form = button.closest('form');
    fireEvent.change(within(form).getByLabelText('New password'), {
      target: { value: 'a-new-password-1' },
    });
    fireEvent.change(within(form).getByLabelText('Repeat password'), {
      target: { value: 'a-new-password-1' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Set a password' }));
    await vi.waitFor(() => expect(server.state.sent).toHaveLength(1), { timeout: 20_000 });
    expect(Object.keys(first).sort()).toEqual(['authKey', 'salt']);
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('a-new-password-1');
    const { wrapKey, authKey } = await deriveAccountKeys('a-new-password-1', first.salt);
    expect(server.state.sent[0].authKey).toBe(authKey);
    const opened = await openSealed(server.state.sent[0].sealedPrivateKey, wrapKey);
    expect(opened).toEqual(deviceEntry().privateKey);
  });
});

describe('the first password, typed twice', () => {
  // The two "Set a password" forms: the account page's own and the one in Private messages.
  async function firstPasswordForm(where) {
    const section = await privateMessages();
    const name = { name: 'Set a password' };
    if (where === 'private messages') {
      return (await within(section).findByRole('button', name)).closest('form');
    }
    const buttons = await screen.findAllByRole('button', name);
    return buttons.find((button) => !section.contains(button)).closest('form');
  }
  const fill = (form, password, repeated) => {
    fireEvent.change(within(form).getByLabelText('New password'), {
      target: { value: password },
    });
    fireEvent.change(within(form).getByLabelText('Repeat password'), {
      target: { value: repeated },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Set a password' }));
  };

  it.each(['account page', 'private messages'])(
    '%s: a typo in the repeat sends nothing and says so at the field',
    async (where) => {
      const calls = mockApi({ ...weudlll(), ...keys().answers });
      renderAt('/account');
      const form = await firstPasswordForm(where);
      fill(form, 'a-new-password-1', 'a-new-password-2');
      expect(await within(form).findByText(PASSWORDS_DIFFER)).toBeInTheDocument();
      expect(within(form).getByLabelText('Repeat password')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(calls.filter((c) => !c.key.startsWith('GET '))).toEqual([]);
    }
  );

  it('account page: the same password twice sets it', async () => {
    const server = keys();
    let first;
    mockApi({
      ...weudlll(),
      ...server.answers,
      'POST /auth/password/first': (sent) => {
        first = sent;
        return { body: { ok: true } };
      },
    });
    renderAt('/account');
    fill(await firstPasswordForm('account page'), 'a-new-password-1', 'a-new-password-1');
    await vi.waitFor(() => expect(first).toBeDefined(), { timeout: 20_000 });
    expect(Object.keys(first).sort()).toEqual(['authKey', 'salt']);
  });
});

describe('on a device without the key', () => {
  it('the recovery code opens it, with nothing to re-seal', async () => {
    const { publicKey, privateKey } = await newKeyPair();
    const salt = await newSalt();
    const code = 'ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2-34567';
    const sealed = await sealBytes(privateKey, await deriveRecoveryKey(code, salt));
    const server = keys({
      keyId: 4,
      publicKey,
      sealedPrivateKey: sealed,
      recovery: { salt, sealed },
    });
    const calls = mockApi({ ...weudlll(), ...server.answers });
    renderAt('/account');
    const section = await privateMessages();
    fireEvent.change(await within(section).findByLabelText('Recovery code'), {
      target: { value: code },
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Use recovery code' }));
    await vi.waitFor(() => expect(deviceEntry()?.privateKey).toEqual(privateKey), {
      timeout: 20_000,
    });
    expect(calls.some((c) => c.key === 'PUT /keys/sealed')).toBe(false);
  });
});
