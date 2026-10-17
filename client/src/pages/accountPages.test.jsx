// ============================================================
// File:        accountPages.test.jsx
// Path:        client/src/pages/accountPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the Register, Login and Account pages: client-side rules (age
//              checkbox), server errors shown, redirects (including no open redirect), the
//              guard on /account and the password change.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

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

describe('Register page', () => {
  it('refuses to send without the age confirmation', async () => {
    const calls = mockApi(GUEST);
    renderAt('/register');
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 14');
    expect(calls.map((c) => c.key)).toEqual(['GET /auth/session']);
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
    expect(calls[1].body).toEqual({
      username: 'anna',
      email: 'anna@example.org',
      password: 'correct-horse-1',
      ageConfirmed: true,
    });
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
  const login = (status, body) => ({ ...GUEST, 'POST /auth/login': { status, body } });

  it('shows the error for wrong credentials', async () => {
    mockApi(login(401, { ok: false, message: 'Wrong username or password.' }));
    renderAt('/login');
    type('Username', 'anna');
    type('Password', 'nope-nope-nope');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });

  it('goes to ?next= after login, but never to another site', async () => {
    mockApi(login(200, { ok: true, user: anna }));
    renderAt('/login?next=%2F%2Fevil.example');
    type('Username', 'anna');
    type('Password', 'correct-horse-1');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });
});

describe('Account page', () => {
  it('sends a guest to the login page', async () => {
    mockApi(GUEST);
    renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('shows the account and changes the password', async () => {
    const calls = mockApi({ ...signedIn(anna), 'POST /auth/password': { body: { ok: true } } });
    renderAt('/account');
    expect(await screen.findByText('anna@example.org')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveTextContent('anna');
    type('Current password', 'correct-horse-1');
    type('New password', 'battery-staple-2');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
    expect(calls.at(-1)).toEqual({
      key: 'POST /auth/password',
      body: { currentPassword: 'correct-horse-1', newPassword: 'battery-staple-2' },
    });
  });
});
