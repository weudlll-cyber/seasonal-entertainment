// ============================================================
// File:        AdminUsersPage.jsx
// Path:        client/src/admin/AdminUsersPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin users list with search; each row changes role, which embedded games the
//              account may host (one box per game),
//              lock and password, or deletes the account (UserRow). The list reloads after every
//              change.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import UserRow from './UserRow.jsx';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  // GET /api/admin/users: { users, games } (games: one hosting box each).
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // bumped after a change to reload the list

  // A newer search cancels the older one, so a slow answer never overwrites a fresh one.
  useEffect(() => {
    let current = true;
    api(`/admin/users?q=${encodeURIComponent(search)}`)
      .then((data) => current && (setList(data), setError(null)))
      .catch((err) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [search, version]);

  return (
    <>
      <h2>Users</h2>
      <form className="form" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span className="form-field__label">Search username or email</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </form>
      <FormMessage error={error} />
      {list && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>May host</th>
                <th>Locked</th>
                <th>Password</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {list.users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  games={list.games}
                  onChanged={() => setVersion((v) => v + 1)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
