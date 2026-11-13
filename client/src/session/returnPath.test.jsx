// ============================================================
// File:        returnPath.test.jsx
// Path:        client/src/session/returnPath.test.jsx
// Project:     Seasonal Entertainment
// Description: A page for members keeps where the guest was going through the login
//              (RequireUser, nextPage.js herePath): the same path, ?query and #anchor come
//              back afterwards, and the account section the anchor names is open. A `next`
//              that would leave the site still ends on the account page (no open redirect).
// ============================================================

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, NO_KEY, PRELOGIN, mockApi, signedIn } from '../test/mockApi.js';

const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };

// The whole address, so a test can read the query and the anchor.
function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}
const where = () => screen.getByTestId('where').textContent;

// A guest at `path`, who can log in as anna.
function guestAt(path) {
  mockApi({
    ...GUEST,
    ...PRELOGIN,
    ...NO_KEY,
    'POST /auth/login': signedIn(anna)['GET /auth/session'],
    'GET /profiles/me': signedIn(anna)['GET /profiles/me'],
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>
  );
}

async function logIn() {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'anna' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

it('keeps the path, the ?query and the #anchor through the login and back', async () => {
  guestAt('/account?from=mail#privacy');
  await screen.findByRole('button', { name: 'Log in' });
  expect(where()).toBe('/login?next=%2Faccount%3Ffrom%3Dmail%23privacy');
  await logIn();
  await waitFor(() => expect(where()).toBe('/account?from=mail#privacy'), { timeout: 20_000 });
  expect(await screen.findByRole('button', { name: /^Privacy/ })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

it.each(['//evil.example', '/\\evil.example', 'https://evil.example/account'])(
  'a next of %s leaving the site ends on the account page',
  async (next) => {
    guestAt(`/login?next=${encodeURIComponent(next)}`);
    await logIn();
    await waitFor(() => expect(where()).toBe('/account'), { timeout: 20_000 });
  }
);
