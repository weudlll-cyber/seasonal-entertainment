// ============================================================
// File:        twoFactorPages.test.jsx
// Path:        client/src/pages/twoFactorPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the 2FA screens: the second login step (code or recovery code), the
//              setup on the account page (QR, first code, recovery codes shown once) and the
//              banner leading staff without 2FA to the setup.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { GUEST, PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

const anna = { id: 1, username: 'anna', role: 'member', twoFactorEnabled: false };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function passwordStep() {
  renderAt('/login');
  type('Username', 'anna');
  type('Password', 'correct-horse-1');
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText('This account uses two-factor authentication.');
}

describe('login with 2FA', () => {
  const answers = {
    ...GUEST,
    ...PRELOGIN,
    'POST /auth/login': { body: { ok: true, twoFactorRequired: true } },
    'POST /2fa/login': { body: { ok: true, user: anna } },
  };

  it('asks for the code after the password and then logs in', async () => {
    const calls = mockApi(answers);
    await passwordStep();
    type('Authentication code', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    // Looked up by name: the shell's chat drawer reloads its rooms after the login.
    expect(calls.find((c) => c.key === 'POST /2fa/login').body).toEqual({ code: '123456' });
  });

  it('can use a recovery code instead', async () => {
    const calls = mockApi(answers);
    await passwordStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    type('Recovery code', 'abcd-efgh');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Account' });
    expect(calls.find((c) => c.key === 'POST /2fa/login').body).toEqual({
      recoveryCode: 'abcd-efgh',
    });
  });
});

describe('2FA setup on the account page', () => {
  it('shows the QR code, confirms the first code and shows the recovery codes', async () => {
    const calls = mockApi({
      ...signedIn(anna),
      ...PRELOGIN,
      'POST /2fa/setup': {
        body: { ok: true, secret: 'JBSWY3DPEHPK3PXP', qrCode: 'data:image/png;base64,AAAA' },
      },
      'POST /2fa/enable': { body: { ok: true, recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'] } },
    });
    renderAt('/account');
    const start = await screen.findByRole('button', { name: 'Set up two-factor authentication' });
    // The 2FA form's own field: the page's "Private messages" section has a password field too
    // (shown once the key state is known; waited for, so this never depends on timing).
    await screen.findByRole('button', { name: 'Unlock private messages' });
    fireEvent.change(within(start.closest('form')).getByLabelText('Password'), {
      target: { value: 'correct-horse-1' },
    });
    fireEvent.click(start);
    expect(await screen.findByAltText('QR code for your authenticator app')).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA'
    );
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    // The setup is started with the current password, sent as the auth key derived from it.
    const { authKey } = await deriveAccountKeys('correct-horse-1', PRELOGIN_SALT);
    expect(calls.find((c) => c.key === 'POST /2fa/setup').body).toEqual({ authKey });
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('correct-horse-1');
    type('Code from the app', '654321');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('aaaa-bbbb')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /2fa/enable').body).toEqual({ code: '654321' });
  });
});

describe('staff banner', () => {
  it('leads an organiser without 2FA to the setup', async () => {
    mockApi(signedIn({ ...anna, role: 'organiser', twoFactorRequired: true }));
    renderAt('/');
    const banner = await screen.findByText(/Your role requires two-factor authentication/);
    expect(banner.closest('p').querySelector('a')).toHaveAttribute('href', '/account#two-factor');
  });

  it('is not shown to members', async () => {
    mockApi(signedIn(anna));
    renderAt('/');
    await screen.findByRole('link', { name: /^anna/ });
    expect(screen.queryByText(/Your role requires/)).toBeNull();
  });
});
