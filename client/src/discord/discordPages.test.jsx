// ============================================================
// File:        discordPages.test.jsx
// Path:        client/src/discord/discordPages.test.jsx
// Project:     Seasonal Entertainment
// Description: The Discord login in the browser (docs/AUTH.md, "Discord"; SE-DISCORD-1 piece 1):
//              "Log in with Discord" only while the server has it set up, the reasons it comes
//              back with, the 2FA step after a Discord login of an account that has 2FA, the
//              password sign-up page's Discord hint (only while set up), the Discord sign-up
//              page (name offered, age required), and the account page's Discord section
//              (link; unlink with the password, or the hint to set one first).
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, NO_KEY, PRELOGIN, mockApi, signedIn, withFeatures } from '../test/mockApi.js';
import { needsDiscordConfirm } from './discordLinks.js';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const DISCORD = { discord: true };
const linked = {
  name: 'weudlll',
  status: 'member',
  refreshedAt: '2026-11-02T22:00:00.000Z',
  steps: [
    { ladder: 'holder', name: 'Ultimate-Dragon Whale', icon: null },
    { ladder: 'investor', name: 'Level 4', icon: null },
  ],
};

describe('the login page', () => {
  it('offers Discord only while the server has it set up', async () => {
    mockApi(GUEST);
    const { unmount } = renderAt('/login');
    await screen.findByRole('button', { name: 'Log in' });
    expect(screen.queryByRole('link', { name: 'Log in with Discord' })).toBeNull();
    unmount();
    mockApi(withFeatures(GUEST, DISCORD));
    renderAt('/login?next=%2Fchat');
    const link = await screen.findByRole('link', { name: 'Log in with Discord' });
    expect(link).toHaveAttribute('href', '/api/auth/discord/start?intent=login&next=%2Fchat');
  });

  it('says why a Discord login came back', async () => {
    mockApi(withFeatures(GUEST, DISCORD));
    renderAt('/login?discord=denied');
    expect(await screen.findByRole('alert')).toHaveTextContent('did not allow the login');
  });

  it('asks for the 2FA code at once after a Discord login of an account with 2FA', async () => {
    mockApi(withFeatures(GUEST, DISCORD));
    renderAt('/login?discord=2fa');
    expect(await screen.findByText('This account uses two-factor authentication.')).toBeTruthy();
  });
});

describe('the password sign-up page', () => {
  it('shows the Discord hint only while the server has Discord set up', async () => {
    mockApi(GUEST);
    const { unmount } = renderAt('/register');
    await screen.findByRole('button', { name: 'Create account' });
    expect(screen.queryByText(/Have a Discord account\?/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign up with Discord' })).toBeNull();
    unmount();
    mockApi(withFeatures(GUEST, DISCORD));
    renderAt('/register?next=%2Fchat');
    expect(await screen.findByText(/your Seasonal Tokens roles then show/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign up with Discord' });
    expect(link).toHaveAttribute('href', '/api/auth/discord/start?intent=login&next=%2Fchat');
  });
});

describe('the Discord sign-up page', () => {
  it('offers the name, needs the age confirmation, then creates the account', async () => {
    const calls = mockApi({
      ...withFeatures(GUEST, DISCORD),
      'GET /auth/discord/signup': {
        body: { ok: true, discordName: 'weudlll', suggested: 'weudlll2' },
      },
      'POST /auth/discord/register': { status: 201, body: { ok: true, userId: 9 } },
    });
    renderAt('/register/discord?next=%2Fchat');
    expect(await screen.findByLabelText('Username')).toHaveValue('weudlll2');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 14');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await expect.poll(() => calls.some((c) => c.key === 'POST /auth/discord/register')).toBe(true);
    const sent = calls.find((c) => c.key === 'POST /auth/discord/register').body;
    expect(sent).toEqual({ username: 'weudlll2', ageConfirmed: true });
  });

  it('says so when no sign-up is waiting', async () => {
    mockApi({
      ...withFeatures(GUEST, DISCORD),
      'GET /auth/discord/signup': { status: 404, body: { error: 'not_found' } },
    });
    renderAt('/register/discord');
    expect(await screen.findByText(/This sign-up has expired/)).toBeTruthy();
  });
});

describe('the account page', () => {
  it('offers linking Discord to an account without a link', async () => {
    mockApi({
      ...withFeatures(signedIn({ username: 'anna', role: 'member' }), DISCORD),
      ...NO_KEY,
    });
    renderAt('/account');
    const link = await screen.findByRole('link', { name: 'Link Discord' });
    expect(link).toHaveAttribute('href', '/api/auth/discord/start?intent=link&next=%2Faccount');
  });

  it('shows the linked name and the full step names, and unlinks with the password', async () => {
    const calls = mockApi({
      ...withFeatures(signedIn({ username: 'anna', role: 'member', discord: linked }), DISCORD),
      ...NO_KEY,
      ...PRELOGIN,
      'DELETE /auth/discord': { body: { ok: true } },
    });
    renderAt('/account');
    expect(await screen.findByText('Ultimate-Dragon Whale')).toBeTruthy();
    expect(screen.getByText('Level 4')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password to unlink Discord'), {
      target: { value: 'correct-horse-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Discord' }));
    // The password's keys take a moment (Argon2), more while other tests run.
    await expect
      .poll(() => calls.some((c) => c.key === 'DELETE /auth/discord'), { timeout: 20_000 })
      .toBe(true);
    const body = calls.find((c) => c.key === 'DELETE /auth/discord').body;
    expect(Object.keys(body)).toEqual(['authKey']);
  });

  it('tells an account without a password to set one before unlinking', async () => {
    mockApi({
      ...withFeatures(
        signedIn({ username: 'weudlll', role: 'member', hasPassword: false, discord: linked }),
        DISCORD
      ),
      ...NO_KEY,
    });
    renderAt('/account');
    expect(await screen.findByText(/To unlink Discord, set a password first/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlink Discord' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Set a password' })).toBeTruthy();
  });
});

describe('the Discord proof of an account without a password', () => {
  it('is needed when missing or about to end, never for a password account', () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    const later = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(needsDiscordConfirm({ hasPassword: false, discordProofUntil: null })).toBe(true);
    expect(needsDiscordConfirm({ hasPassword: false, discordProofUntil: soon })).toBe(true);
    expect(needsDiscordConfirm({ hasPassword: false, discordProofUntil: later })).toBe(false);
    expect(needsDiscordConfirm({ hasPassword: true, discordProofUntil: null })).toBe(false);
  });
});
