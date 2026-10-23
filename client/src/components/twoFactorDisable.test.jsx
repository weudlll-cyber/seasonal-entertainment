// ============================================================
// File:        twoFactorDisable.test.jsx
// Path:        client/src/components/twoFactorDisable.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards turning 2FA off (TwoFactorDisable.jsx): the password goes out only as the
//              auth key derived with the account's salt, together with the code; success hands over
//              to the page; a wrong password or code, too many tries or a server error shows the
//              server's message and changes nothing; a new try clears the old message.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider, useSession } from '../session/SessionContext.jsx';
import { PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';
import TwoFactorDisable from './TwoFactorDisable.jsx';

const anna = { username: 'anna', role: 'member', twoFactorEnabled: true };
const PASSWORD = 'correct-horse-1';

// As on the account page: the form shows once the session knows the member.
function Page({ onDisabled }) {
  const { user } = useSession();
  return user ? <TwoFactorDisable onDisabled={onDisabled} /> : null;
}

// disable: the answer to POST /2fa/disable (or a function of the sent body).
async function submit(disable) {
  const calls = mockApi({ ...signedIn(anna), ...PRELOGIN, 'POST /2fa/disable': disable });
  const onDisabled = vi.fn();
  render(
    <SessionProvider>
      <Page onDisabled={onDisabled} />
    </SessionProvider>
  );
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '123456' } });
  const button = screen.getByRole('button', { name: 'Turn off two-factor authentication' });
  fireEvent.click(button);
  return { calls, onDisabled, button };
}

const refused = (status, error, message) => ({ status, body: { ok: false, error, message } });

describe('turning 2FA off', () => {
  it('sends the auth key and the code, never the password, then hands over', async () => {
    const { calls, onDisabled } = await submit({ body: { ok: true } });
    await vi.waitFor(() => expect(onDisabled).toHaveBeenCalledTimes(1));
    expect(calls.find((c) => c.key === 'POST /auth/prelogin').body).toEqual({ username: 'anna' });
    const { authKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
    expect(calls.find((c) => c.key === 'POST /2fa/disable').body).toEqual({
      authKey,
      code: '123456',
    });
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain(PASSWORD);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    // The server answers a wrong password and a wrong code alike (twofa/routes.js).
    ['a wrong password or code', refused(401, 'invalid_credentials', 'Password or code is wrong.')],
    [
      'too many tries',
      refused(429, 'too_many_attempts', 'Too many attempts. Please try again later.'),
    ],
    ['a server error', refused(500, 'server_error', 'Something went wrong on the server.')],
  ])('shows the message for %s and stays on', async (_name, answer) => {
    const { onDisabled } = await submit(answer);
    expect(await screen.findByRole('alert')).toHaveTextContent(answer.body.message);
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('clears the old message when the next try succeeds', async () => {
    let tries = 0;
    const { onDisabled, button } = await submit(() =>
      ++tries === 1
        ? refused(401, 'invalid_credentials', 'Password or code is wrong.')
        : { body: { ok: true } }
    );
    await screen.findByRole('alert');
    fireEvent.click(button);
    await vi.waitFor(() => expect(onDisabled).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
