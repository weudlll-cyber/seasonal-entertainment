// ============================================================
// File:        adminPages.test.jsx
// Path:        client/src/admin/adminPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the admin area screens: who can open them, the users list and its
//              controls (including a refusal shown in the row), and the audit log listing.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

const admin = { id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true };
const bert = {
  id: 2,
  username: 'bert',
  email: 'bert@example.org',
  role: 'member',
  canStartGames: false,
  locked: false,
};

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('access to /admin', () => {
  it('a member sees "Not allowed" and no Admin link', async () => {
    mockApi(signedIn({ id: 3, username: 'mia', role: 'member' }));
    renderAt('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('a guest is sent to the login page', async () => {
    mockApi(GUEST);
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});

describe('users page', () => {
  const answers = (overrides = {}) => ({
    ...signedIn(admin),
    'GET /admin/users?q=': { body: { ok: true, users: [bert] } },
    ...overrides,
  });

  it('lists users and changes a role', async () => {
    const calls = mockApi(answers({ 'POST /admin/users/2/role': { body: { ok: true } } }));
    renderAt('/admin');
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeInTheDocument();
    const role = await screen.findByLabelText('Role for bert');
    fireEvent.change(role, { target: { value: 'organiser' } });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /admin/users/2/role').body).toEqual({
      role: 'organiser',
    });
  });

  it('shows a refusal in the row', async () => {
    mockApi(
      answers({
        'POST /admin/users/2/lock': {
          status: 409,
          body: { ok: false, error: 'last_admin', message: 'The last admin cannot be removed.' },
        },
      })
    );
    renderAt('/admin/users');
    fireEvent.click(await screen.findByLabelText('Locked for bert'));
    const row = screen.getByText('bert').closest('tr');
    expect(await within(row).findByText('The last admin cannot be removed.')).toBeInTheDocument();
  });
});

describe('audit page', () => {
  it('lists entries in the order the server gives (newest first)', async () => {
    mockApi({
      ...signedIn(admin),
      'GET /admin/audit': {
        body: {
          ok: true,
          entries: [
            {
              id: 2,
              at: '2026-10-17T03:00:00.000Z',
              actor: 'ada',
              action: 'user.lock',
              targetType: 'user',
              targetId: '2',
              before: { locked: false },
              after: { locked: true },
            },
            {
              id: 1,
              at: '2026-10-17T02:00:00.000Z',
              actor: 'ada',
              action: 'user.role',
              targetType: 'user',
              targetId: '2',
              before: { role: 'member' },
              after: { role: 'organiser' },
            },
          ],
        },
      },
    });
    renderAt('/admin/audit');
    await screen.findByText('user.lock');
    const rows = screen.getAllByRole('row');
    expect(rows.slice(1).map((r) => within(r).getAllByRole('cell')[2].textContent)).toEqual([
      'user.lock',
      'user.role',
    ]);
    expect(rows[1]).toHaveTextContent('2026-10-17 03:00:00');
  });
});
