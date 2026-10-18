// ============================================================
// File:        AdminInfoListPage.jsx
// Path:        client/src/admin/AdminInfoListPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin list of all info pages (drafts too): status, last change, move up/down
//              (the order of the public Info index), links to edit and to create a new page.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';

export default function AdminInfoListPage() {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/admin/info')
      .then((data) => setPages(data.pages))
      .catch((err) => setError(err.message));
  }, [version]);

  async function move(index, delta) {
    const ids = pages.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    try {
      await api('/admin/info/reorder', { method: 'POST', body: { ids } });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h2>Info pages</h2>
      <p>
        <Link className="button" to="/admin/info/new">
          New page
        </Link>
      </p>
      <FormMessage error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Address</th>
              <th>Status</th>
              <th>Last change</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page, index) => (
              <tr key={page.id}>
                <td>
                  <Link to={`/admin/info/${page.id}`}>{page.title}</Link>
                </td>
                <td>/info/{page.slug}</td>
                <td>{page.status}</td>
                <td>
                  {page.updatedAt.slice(0, 10)} {page.updatedBy}
                </td>
                <td className="admin-row-actions">
                  <button
                    className="link-button"
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${page.title} up`}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="link-button"
                    type="button"
                    disabled={index === pages.length - 1}
                    aria-label={`Move ${page.title} down`}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
