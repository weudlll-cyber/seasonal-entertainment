// ============================================================
// File:        accountSettings.test.jsx
// Path:        client/src/pages/accountSettings.test.jsx
// Project:     Seasonal Entertainment
// Description: The "Accounts" site settings in the browser: with registration closed the
//              register page says so instead of the form; while the site requires 2FA for every
//              member, a member without it sees the banner to set it up and is taken to the
//              setup after login instead of the page they came from.
// ============================================================

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GUEST, PRELOGIN, mockApi, signedIn, withSettings } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const DATA = { 'GET /games': { body: { ok: true, games: [] } } };

describe('registration', () => {
  it('closed: the page says so and offers the login', async () => {
    mockApi(withSettings(GUEST, { 'accounts.registrationOpen': false }));
    await renderApp('/register');
    expect(await screen.findByText('Registration is closed at the moment.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.getByText(/Already registered/)).toBeInTheDocument();
  });

  it('open: the form', async () => {
    mockApi(GUEST);
    await renderApp('/register');
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.queryByText('Registration is closed at the moment.')).toBeNull();
  });
});

describe('2FA for every member', () => {
  const mia = { id: 4, username: 'mia', role: 'member' };

  it('a member who must set it up sees the banner', async () => {
    mockApi({ ...signedIn({ ...mia, twoFactorRequired: true }), ...DATA });
    await renderApp('/games');
    expect(
      await screen.findByText(/This site requires two-factor authentication for every member/)
    ).toBeInTheDocument();
  });

  // ?next=/games: a member goes back there; one who must set up 2FA goes to the setup.
  async function logIn(user) {
    mockApi({
      ...GUEST,
      ...PRELOGIN,
      ...DATA,
      'POST /auth/login': { body: { ok: true, user } },
    });
    await renderApp('/login?next=/games');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'mia' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  }

  it('after login, a member who must set it up is taken to the setup', async () => {
    await logIn({ ...mia, twoFactorRequired: true });
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('a member who need not goes back where they came from', async () => {
    await logIn({ ...mia, twoFactorRequired: false });
    expect(await screen.findByRole('heading', { name: 'Games' })).toBeInTheDocument();
  });
});
