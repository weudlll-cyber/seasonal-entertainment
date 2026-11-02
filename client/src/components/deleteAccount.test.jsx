// ============================================================
// File:        deleteAccount.test.jsx
// Path:        client/src/components/deleteAccount.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards "Delete my account" (DeleteAccountForm.jsx): the warning says what goes
//              and what stays; the password goes out only as the auth key derived with the
//              account's salt; with 2FA on, an app code or a recovery code goes along (without
//              2FA, no code field); the confirmation box must be ticked; on success the page
//              becomes a guest's and goes home; a refusal (wrong password or code, the last
//              admin) shows the server's message and stays.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import RequireUser from '../session/RequireUser.jsx';
import { SessionProvider, useSession } from '../session/SessionContext.jsx';
import { PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';
import DeleteAccountForm from './DeleteAccountForm.jsx';

const PASSWORD = 'correct-horse-1';
const anna = { username: 'anna', role: 'member', twoFactorEnabled: false };

// The form as on the account page, and a home page that shows who is signed in.
function Account() {
  const { user } = useSession();
  return user ? <DeleteAccountForm /> : null;
}
function Home() {
  const { user } = useSession();
  return <p>Home of {user === null ? 'a guest' : 'someone'}</p>;
}

// deletion: the answer to DELETE /auth/account.
async function submit(deletion, { user = anna, factor } = {}) {
  const calls = mockApi({ ...signedIn(user), ...PRELOGIN, 'DELETE /auth/account': deletion });
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<p>Login page</p>} />
          {/* Guarded as in the app: a guest there is sent to the login page. */}
          <Route
            path="/account"
            element={
              <RequireUser>
                <Account />
              </RequireUser>
            }
          />
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  );
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: PASSWORD } });
  if (factor !== undefined) {
    fireEvent.change(screen.getByLabelText('Code from the app, or a recovery code'), {
      target: { value: factor },
    });
  }
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
  return calls;
}

const sent = (calls) => calls.find((c) => c.key === 'DELETE /auth/account')?.body;
const authKey = async () => (await deriveAccountKeys(PASSWORD, PRELOGIN_SALT)).authKey;

describe('deleting your own account', () => {
  it('warns in plain words what goes and what stays, and asks for a ticked confirmation', async () => {
    mockApi(signedIn(anna));
    render(
      <SessionProvider>
        <MemoryRouter>
          <Account />
        </MemoryRouter>
      </SessionProvider>
    );
    expect(await screen.findByText(/cannot be undone/)).toHaveTextContent(
      /every chat message you wrote.*all your private conversations, for the other member too/
    );
    expect(screen.getByText(/^Kept:/)).toHaveTextContent(
      /admin and moderation log, and call recordings.*for 30 days a note.*up to about 30 days/
    );
    expect(screen.getByRole('checkbox')).toBeRequired();
    // Without 2FA there is no code to give.
    expect(screen.queryByLabelText('Code from the app, or a recovery code')).toBeNull();
  });

  it('sends the auth key, never the password, then is a guest at home', async () => {
    const calls = await submit({ body: { ok: true } });
    expect(await screen.findByText('Home of a guest')).toBeInTheDocument();
    expect(sent(calls)).toEqual({ authKey: await authKey() });
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain(PASSWORD);
  });

  it.each([
    ['an app code', '123456', { code: '123456' }],
    ['a recovery code', 'abcd-efgh', { recoveryCode: 'abcd-efgh' }],
  ])('with 2FA on, sends %s along', async (_name, factor, expected) => {
    const user = { ...anna, twoFactorEnabled: true };
    const calls = await submit({ body: { ok: true } }, { user, factor });
    expect(await screen.findByText('Home of a guest')).toBeInTheDocument();
    expect(sent(calls)).toEqual({ authKey: await authKey(), ...expected });
  });

  it.each([
    ['a wrong password or code', 401, 'invalid_credentials', 'Password or code is wrong.'],
    ['the last admin', 409, 'last_admin', 'You are the last admin.'],
  ])('shows the refusal for %s and stays', async (_name, status, error, message) => {
    await submit({ status, body: { ok: false, error, message } });
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
    expect(screen.queryByText(/^Home of/)).toBeNull();
  });
});
