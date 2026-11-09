// ============================================================
// File:        adminPages.test.jsx
// Path:        client/src/admin/adminPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the admin area screens: who can open them, the users list and its
//              controls (one hosting box per embedded game, named as the game; a refusal shown in
//              the row, and a password reset that checks
//              the password rules and sends only a new salt and auth key, and a deletion only
//              after the admin confirms it), and the audit log.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { formatWhen } from '../app/dates.js';
import { PASSWORDS_DIFFER } from '../components/RepeatPasswordField.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

const admin = { id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true };
const bert = {
  id: 2,
  username: 'bert',
  email: 'bert@example.org',
  role: 'member',
  hostGames: ['mini-games'],
  locked: false,
};
// The embedded games, as GET /api/admin/users lists them.
const GAMES = [
  { slug: 'bingo', name: 'Seasonal Bingo Royale' },
  { slug: 'mini-games', name: 'Seasonal Mini Games' },
];

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
    'GET /admin/users?q=': { body: { ok: true, games: GAMES, users: [bert] } },
    ...overrides,
  });

  it('one hosting box per game, named as the game; a change goes to that game', async () => {
    const calls = mockApi(answers({ 'POST /admin/users/2/game-host': { body: { ok: true } } }));
    renderAt('/admin/users');
    const bingo = await screen.findByLabelText('May host Seasonal Bingo Royale for bert');
    const mini = screen.getByLabelText('May host Seasonal Mini Games for bert');
    expect([bingo.checked, mini.checked]).toEqual([false, true]);
    expect(screen.getByText('Seasonal Bingo Royale')).toBeInTheDocument();
    fireEvent.click(bingo);
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /admin/users/2/game-host').body).toEqual({
      game: 'bingo',
      value: true,
    });
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

  it('resets a password with a new salt and auth key, never the password', async () => {
    const calls = mockApi(answers({ 'POST /admin/users/2/password': { body: { ok: true } } }));
    renderAt('/admin/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
    const field = screen.getByLabelText('New password for bert');
    // The shared password rules are checked here: the server cannot see the password.
    fireEvent.change(field, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(await screen.findByText(/at least 10 characters/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /admin/users/2/password')).toBe(false);

    fireEvent.change(field, { target: { value: 'brand-new-pass-1' } });
    // A typo in the repeat: nothing is sent, the message shows at the field.
    const again = screen.getByLabelText('Repeat password for bert');
    fireEvent.change(again, { target: { value: 'brand-new-pass-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(await screen.findByText(PASSWORDS_DIFFER)).toBeInTheDocument();
    expect(again).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.key === 'POST /admin/users/2/password')).toBe(false);

    fireEvent.change(again, { target: { value: 'brand-new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(await screen.findByText(/Password reset/)).toBeInTheDocument();
    const { body } = calls.find((c) => c.key === 'POST /admin/users/2/password');
    expect(Object.keys(body).sort()).toEqual(['authKey', 'salt']);
    expect(body.authKey).toBe((await deriveAccountKeys('brand-new-pass-1', body.salt)).authKey);
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('brand-new-pass-1');
  });

  describe('deleting an account', () => {
    afterEach(() => vi.restoreAllMocks());
    const deletes = (calls) => calls.filter((c) => c.key === 'DELETE /admin/users/2');
    const lists = (calls) => calls.filter((c) => c.key === 'GET /admin/users?q=');

    it('asks first, naming the account; nothing is sent when the admin cancels', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const calls = mockApi(answers({ 'DELETE /admin/users/2': { body: { ok: true } } }));
      renderAt('/admin/users');
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account for bert' }));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Delete the account bert?'));
      expect(deletes(calls)).toEqual([]);
    });

    it('deletes after the confirmation and reloads the list', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const calls = mockApi(answers({ 'DELETE /admin/users/2': { body: { ok: true } } }));
      renderAt('/admin/users');
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account for bert' }));
      await vi.waitFor(() => expect(lists(calls)).toHaveLength(2));
      expect(deletes(calls)).toHaveLength(1);
    });

    it('shows a refusal in the row', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const message = 'The last admin cannot be removed.';
      mockApi(
        answers({
          'DELETE /admin/users/2': {
            status: 409,
            body: { ok: false, error: 'last_admin', message },
          },
        })
      );
      renderAt('/admin/users');
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account for bert' }));
      const row = screen.getByText('bert').closest('tr');
      expect(await within(row).findByText(message)).toBeInTheDocument();
    });
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
    // The site's one date format, in the device's zone (plain spaces, as the matcher compares).
    expect(rows[1]).toHaveTextContent(formatWhen('2026-10-17T03:00:00.000Z').replace(/\s/g, ' '));
  });
});
