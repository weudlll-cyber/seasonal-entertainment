// ============================================================
// File:        InfoIndexPage.jsx
// Path:        client/src/pages/InfoIndexPage.jsx
// Project:     Seasonal Entertainment
// Description: /info: the list of published info pages, in the order the admins set.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';

export default function InfoIndexPage() {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/info')
      .then((data) => setPages(data.pages))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section className="page">
      <h1>Info</h1>
      <FormMessage error={error} />
      {pages?.length === 0 && <p>No pages yet.</p>}
      {pages && (
        <ul className="link-list">
          {pages.map((page) => (
            <li key={page.slug}>
              <Link to={`/info/${page.slug}`}>{page.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
