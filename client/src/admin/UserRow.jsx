// ============================================================
// File:        UserRow.jsx
// Path:        client/src/admin/UserRow.jsx
// Project:     Seasonal Entertainment
// Description: One row of the admin users list. Every control calls its own admin route; one
//              box per embedded game says whether this account may host it (decided 2026-11-09;
//              an admin may host every game, so theirs are ticked and fixed);
//              a refusal (e.g. "the last admin cannot be removed") is shown in the row. A
//              password reset checks the shared password rules and the repeated password
//              (RepeatPasswordField.jsx) here and sends only a new salt and auth key derived from
//              the password (session/credentials.js). Deleting the
//              account asks for a confirmation first (docs/AUTH.md, "Deleting an account").
// ============================================================

import { useState } from 'react';
import { ROLES, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { api } from '../api/http.js';
import { RepeatPasswordField, useRepeatPassword } from '../components/RepeatPasswordField.jsx';
import { keysForNewPassword } from '../session/credentials.js';

// games: [{ slug, name }] of every embedded game (GET /api/admin/users).
export default function UserRow({ user, games, onChanged }) {
  const [message, setMessage] = useState(null);
  const [resetting, setResetting] = useState(false);
  const label = (what) => `${what} for ${user.username}`;
  const repeat = useRepeatPassword('newPassword');

  async function change(route, body, done = 'Saved.') {
    try {
      await api(`/admin/users/${user.id}/${route}`, { method: 'POST', body });
      setMessage(done);
      onChanged();
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    }
  }

  async function deleteAccount() {
    const sure = window.confirm(
      `Delete the account ${user.username}? Everything of it goes at once and cannot be restored: ` +
        'its chat messages and files, its private conversations (for the other members too), ' +
        'its keys, favourites and reports.'
    );
    if (!sure) return;
    try {
      await api(`/admin/users/${user.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = form.get('newPassword');
    const problem = validatePassword(newPassword);
    if (problem) return setMessage(problem);
    setMessage(null);
    if (!repeat.matches(form)) return;
    const { salt, authKey } = await keysForNewPassword(newPassword);
    if (await change('password', { salt, authKey }, 'Password reset; their sessions ended.')) {
      setResetting(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{user.username}</strong>
        <br />
        {user.email}
        {message && (
          <>
            <br />
            <span role="status">{message}</span>
          </>
        )}
      </td>
      <td>
        <select
          aria-label={label('Role')}
          value={user.role}
          onChange={(e) => change('role', { role: e.target.value })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </td>
      <td className="admin-host-games">
        {games.map((game) => (
          // One game per line: the box and its name side by side (form-check, the site's
          // checkbox with text; table-check centres a lone box), the whole line the 44px target.
          <label key={game.slug} className="form-check">
            <input
              type="checkbox"
              aria-label={label(`May host ${game.name}`)}
              checked={user.role === 'admin' || user.hostGames.includes(game.slug)}
              disabled={user.role === 'admin'}
              onChange={(e) => change('game-host', { game: game.slug, value: e.target.checked })}
            />
            <span>{game.name}</span>
          </label>
        ))}
      </td>
      <td>
        <label className="table-check">
          <input
            type="checkbox"
            aria-label={label('Locked')}
            checked={user.locked}
            onChange={(e) => change('lock', { locked: e.target.checked })}
          />
        </label>
      </td>
      <td>
        {resetting ? (
          <form className="admin-row-actions" onSubmit={resetPassword}>
            <input
              name="newPassword"
              type="password"
              aria-label={label('New password')}
              autoComplete="new-password"
              required
            />
            <RepeatPasswordField {...repeat.fieldProps} ariaLabel={label('Repeat password')} />
            <button className="button" type="submit">
              Set
            </button>
          </form>
        ) : (
          <button className="link-button" type="button" onClick={() => setResetting(true)}>
            Reset password
          </button>
        )}
      </td>
      <td>
        {/* admin-row-actions: a full 44px target for the small text button. */}
        <div className="admin-row-actions">
          <button
            className="link-button"
            type="button"
            aria-label={label('Delete account')}
            onClick={deleteAccount}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
