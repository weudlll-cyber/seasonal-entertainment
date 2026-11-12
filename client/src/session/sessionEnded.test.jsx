// ============================================================
// File:        sessionEnded.test.jsx
// Path:        client/src/session/sessionEnded.test.jsx
// Project:     Seasonal Entertainment
// Description: A sign-in that ended on the server while the page still shows the member
//              (docs/AUTH.md, "Sessions"; seen 2026-11-12 as "Please log in." when unlocking
//              private messages): the first "not_authenticated" answer drops the member, shows
//              "Your sign-in has ended. Please sign in again." and leads to the login page,
//              which returns to the page afterwards; on a page for everyone the notice offers
//              "Sign in" with the way back. It happens once: no request is repeated. A wrong
//              password still says only that.
// ============================================================

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import { api } from '../api/http.js';
import App from '../app/App.jsx';
import { browserKey, keyServer } from '../test/keyServer.js';
import { resetDevice } from '../test/memoryDeviceKey.js';
import { PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';
import { SESSION_ENDED } from './SessionEndedNotice.jsx';

vi.mock('../keys/deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const PASSWORD = 'correct-horse-1';
const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };
const NOT_AUTHENTICATED = {
  status: 401,
  body: { ok: false, error: 'not_authenticated', message: 'Please log in.' },
};

beforeEach(() => resetDevice());

// Shows where the router is, so a test can read the address.
function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const where = () => screen.getByTestId('where').textContent;

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>
  );
}

// anna's account page with her key on the server, nothing on this device. `answers` stays the
// live table of the stand-in API: a test changes it to end the session or to sign in again.
async function accountPage() {
  const { authKey, wrapKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
  const { key } = await browserKey(wrapKey);
  const server = keyServer(authKey, key);
  const answers = { ...signedIn(anna), ...PRELOGIN, ...server.answers };
  const calls = mockApi(answers);
  renderAt('/account');
  return { answers, calls, server };
}

const section = () => screen.findByRole('region', { name: 'Private messages' });

async function unlockWith(password) {
  const unlock = await within(await section()).findByRole('button', {
    name: 'Unlock private messages',
  });
  fireEvent.change(within(await section()).getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(unlock);
}

const count = (calls, key) => calls.filter((c) => c.key === key).length;

describe('a sign-in that ended on the server', () => {
  it('drops the member, tells them, and signing in again returns to the page', async () => {
    const { answers, server } = await accountPage();
    await section();
    const keyAnswer = answers['GET /keys/me'];
    answers['GET /keys/me'] = NOT_AUTHENTICATED; // the session ended meanwhile

    await unlockWith(PASSWORD);
    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Log in' });
    expect(where()).toBe('/login?next=%2Faccount');
    // Already on the login page: no link to it.
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();

    answers['GET /keys/me'] = keyAnswer;
    answers['POST /auth/login'] = signedIn(anna)['GET /auth/session'];
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'anna' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(where()).toBe('/account'));
    expect(await section()).toBeInTheDocument();
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
    expect(server.state.key).toBeTruthy();
  });

  it('on a page for everyone it offers "Sign in" with the way back, and asks nothing again', async () => {
    const answers = { ...signedIn(anna), 'GET /games': NOT_AUTHENTICATED };
    const calls = mockApi(answers);
    renderAt('/games?season=spring');
    const notice = (await screen.findByText(SESSION_ENDED)).closest('p');
    expect(within(notice).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fgames%3Fseason%3Dspring'
    );
    expect(where()).toBe('/games?season=spring');
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();

    // The page loads its list once more for a guest, and is refused again (this stand-in
    // refuses everyone): that changes nothing. Neither does another refusal, and nothing
    // asks again by itself.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    await settle();
    const gamesAsked = count(calls, 'GET /games');
    await api('/games').catch(() => {});
    await settle();
    expect(count(calls, 'GET /auth/session')).toBe(1);
    expect(count(calls, 'GET /games')).toBe(gamesAsked + 1); // only this test's own
    expect(screen.getAllByText(SESSION_ENDED)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('a wrong password still says only that, and the member stays signed in', async () => {
    await accountPage();
    await unlockWith('wrong-horse-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('The password is wrong.');
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
    expect(where()).toBe('/account');
  });
});
