// ============================================================
// File:        AdminAuditPage.jsx
// Path:        client/src/admin/AdminAuditPage.jsx
// Project:     Seasonal Entertainment
// Description: The audit log, newest first: when, who, what, on which target, before and
//              after. "Older entries" loads the next page.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';

const show = (value) => (value === null ? '—' : JSON.stringify(value));

export default function AdminAuditPage() {
  const [entries, setEntries] = useState([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);

  // beforeId: undefined for the newest page, else the id after which older entries follow.
  function load(beforeId) {
    const query = beforeId ? `?before=${beforeId}` : '';
    return api(`/admin/audit${query}`)
      .then((data) => {
        setEntries((old) => (beforeId ? [...old, ...data.entries] : data.entries));
        setMore(data.entries.length === 50);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <h2>Audit log</h2>
      <FormMessage error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Who</th>
              <th>What</th>
              <th>Target</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.at.replace('T', ' ').slice(0, 19)}</td>
                <td>{e.actor}</td>
                <td>{e.action}</td>
                <td>
                  {e.targetType} {e.targetId}
                </td>
                <td className="admin-json">{show(e.before)}</td>
                <td className="admin-json">{show(e.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button className="button" type="button" onClick={() => load(entries.at(-1).id)}>
          Older entries
        </button>
      )}
    </>
  );
}
