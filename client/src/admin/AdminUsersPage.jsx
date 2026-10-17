// ============================================================
// File:        AdminUsersPage.jsx
// Path:        client/src/admin/AdminUsersPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin users list with search; each row changes role, "can start games",
//              lock and password (UserRow). The list reloads after every change.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import UserRow from './UserRow.jsx';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // bumped after a change to reload the list

  // A newer search cancels the older one, so a slow answer never overwrites a fresh one.
  useEffect(() => {
    let current = true;
    api(`/admin/users?q=${encodeURIComponent(search)}`)
      .then((data) => current && (setUsers(data.users), setError(null)))
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
      {users && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Can start games</th>
                <th>Locked</th>
                <th>Password</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} onChanged={() => setVersion((v) => v + 1)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
