// ============================================================
// File:        busyButton.test.jsx
// Path:        client/src/components/busyButton.test.jsx
// Project:     Seasonal Entertainment
// Description: While a password form's key derivation runs in the password-hashing worker, its
//              button reads "Checking…" and cannot be pressed again; afterwards it is back.
//              The worker is a stand-in that answers only when the test lets it (with the real
//              worker module's handle()), so the busy moment is held open on purpose.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { handle } from '../session/passwordHashing.worker.js';
import { GUEST, PRELOGIN, mockApi } from '../test/mockApi.js';

// Derivations the stand-in worker holds: answer() lets them through.
const held = [];
async function answer() {
  for (const { worker, message } of held.splice(0)) {
    worker.onmessage({ data: await handle(message) });
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'Worker',
    class {
      postMessage(message) {
        held.push({ worker: this, message });
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('the login button reads "Checking…" while the password is derived', async () => {
  mockApi({
    ...GUEST,
    ...PRELOGIN,
    'POST /auth/login': {
      status: 401,
      body: { ok: false, error: 'bad_login', message: 'Wrong username or password.' },
    },
  });
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>
  );
  type('Username', 'anna');
  type('Password', 'correct-horse-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

  const busy = await screen.findByRole('button', { name: 'Checking…' });
  await vi.waitFor(() => expect(held).toHaveLength(1)); // the derivation is in the worker
  expect(busy).toBeDisabled();
  expect(busy).toHaveAttribute('aria-busy', 'true');

  await answer();
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
});
