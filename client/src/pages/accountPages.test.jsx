// ============================================================
// File:        accountPages.test.jsx
// Path:        client/src/pages/accountPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the Register, Login and Account pages: client-side rules (age
//              checkbox), server errors shown, redirects (including no open redirect), the
//              guard on /account and the password change. No password ever leaves the
//              browser: requests carry salts and auth keys only (docs/AUTH.md).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { base64Length } from '@seasonal-entertainment/shared/cryptoFormat.js';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { GUEST, NO_KEY, PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
// Every request body sent, as one text: a typed password must not appear in it.
const sentText = (calls) => JSON.stringify(calls.map((c) => c.body));
const keysOf = (password) => deriveAccountKeys(password, PRELOGIN_SALT);

describe('Register page', () => {
  it('refuses to send without the age confirmation', async () => {
    const calls = mockApi(GUEST);
    renderAt('/register');
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 14');
    // Nothing was sent (the page shell's own reads, such as the Calls summary, do not count).
    expect(calls.filter((c) => !c.key.startsWith('GET '))).toEqual([]);
  });

  it('from the chat login popup: Register keeps ?next=, and the new member lands back there', async () => {
    const site = 'https://game.example';
    const popup = `/embed-login?origin=${encodeURIComponent(site)}`;
    mockApi({
      ...GUEST,
      [`GET /embed/check?origin=${encodeURIComponent(site)}`]: {
        body: { ok: true, allowed: true },
      },
      'POST /auth/register': { status: 201, body: { ok: true, user: anna } },
    });
    renderAt(`/login?next=${encodeURIComponent(popup)}`);
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Register' }));
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    // The popup's own step again, naming the site that asked.
    const question = await screen.findByText(
      (_, el) => el?.tagName === 'P' && /^Chat on/.test(el.textContent)
    );
    expect(question).toHaveTextContent(`Chat on ${site} as anna?`);
  });

  it('never sends a new member to another site', async () => {
    mockApi({ ...GUEST, 'POST /auth/register': { status: 201, body: { ok: true, user: anna } } });
    renderAt('/register?next=%2F%2Fevil.example');
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('registers and lands on the account page', async () => {
    const calls = mockApi({
      ...GUEST,
      'POST /auth/register': { status: 201, body: { ok: true, user: anna } },
    });
    renderAt('/register');
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    const { body } = calls.find((c) => c.key === 'POST /auth/register');
    expect(Object.keys(body).sort()).toEqual([
      'ageConfirmed',
      'authKey',
      'email',
      'salt',
      'username',
    ]);
    expect(base64Length(body.salt)).toBe(16);
    expect(body.authKey).toBe((await deriveAccountKeys('correct-horse-1', body.salt)).authKey);
    expect(sentText(calls)).not.toContain('correct-horse-1');
  });

  it('shows the server refusal, e.g. a taken username', async () => {
    mockApi({
      ...GUEST,
      'POST /auth/register': {
        status: 409,
        body: {
          ok: false,
          error: 'username_taken',
          message: 'This username is already registered.',
        },
      },
    });
    renderAt('/register');
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already registered');
  });
});

describe('Login page', () => {
  const login = (status, body) => ({
    ...GUEST,
    ...PRELOGIN,
    'POST /auth/login': { status, body },
  });

  it('shows the error for wrong credentials', async () => {
    mockApi(login(401, { ok: false, message: 'Wrong username or password.' }));
    renderAt('/login');
    type('Username', 'anna');
    type('Password', 'nope-nope-nope');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });

  it('goes to ?next= after login, but never to another site', async () => {
    const calls = mockApi(login(200, { ok: true, user: anna }));
    renderAt('/login?next=%2F%2Fevil.example');
    type('Username', 'anna');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    // The salt comes from the pre-login step; only the derived auth key is sent.
    expect(calls.find((c) => c.key === 'POST /auth/prelogin').body).toEqual({ username: 'anna' });
    expect(calls.find((c) => c.key === 'POST /auth/login').body).toEqual({
      username: 'anna',
      authKey: (await keysOf('correct-horse-1')).authKey,
    });
    expect(sentText(calls)).not.toContain('correct-horse-1');
  });
});

describe('Account page', () => {
  it('sends a guest to the login page', async () => {
    mockApi(GUEST);
    renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('shows the account and changes the password', async () => {
    const calls = mockApi({
      ...signedIn(anna),
      ...PRELOGIN,
      ...NO_KEY,
      'POST /auth/password': { body: { ok: true } },
    });
    renderAt('/account');
    expect(await screen.findByText('anna@example.org')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'anna (Member), your account' })).toHaveAttribute(
      'href',
      '/account'
    );
    type('Current password', 'correct-horse-1');
    type('New password', 'battery-staple-2');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
    const { body } = calls.find((c) => c.key === 'POST /auth/password');
    expect(body.currentAuthKey).toBe((await keysOf('correct-horse-1')).authKey);
    expect(body.newAuthKey).toBe(
      (await deriveAccountKeys('battery-staple-2', body.newSalt)).authKey
    );
    expect(body.newSalt).not.toBe(PRELOGIN_SALT);
    expect(sentText(calls)).not.toMatch(/correct-horse-1|battery-staple-2/);
  });
});
