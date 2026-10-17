// ============================================================
// File:        UserRow.jsx
// Path:        client/src/admin/UserRow.jsx
// Project:     Seasonal Entertainment
// Description: One row of the admin users list. Every control calls its own admin route;
//              a refusal (e.g. "the last admin cannot be removed") is shown in the row.
// ============================================================

import { useState } from 'react';
import { ROLES } from '@seasonal-entertainment/shared/accountRules.js';
import { api } from '../api/http.js';

export default function UserRow({ user, onChanged }) {
  const [message, setMessage] = useState(null);
  const [resetting, setResetting] = useState(false);
  const label = (what) => `${what} for ${user.username}`;

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

  async function resetPassword(event) {
    event.preventDefault();
    const newPassword = new FormData(event.currentTarget).get('newPassword');
    if (await change('password', { newPassword }, 'Password reset; their sessions ended.')) {
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
      <td>
        <input
          type="checkbox"
          aria-label={label('Can start games')}
          checked={user.canStartGames || user.role === 'admin'}
          disabled={user.role === 'admin'}
          onChange={(e) => change('can-start-games', { value: e.target.checked })}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={label('Locked')}
          checked={user.locked}
          onChange={(e) => change('lock', { locked: e.target.checked })}
        />
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
    </tr>
  );
}
