// ============================================================
// File:        InfoPage.jsx
// Path:        client/src/pages/InfoPage.jsx
// Project:     Seasonal Entertainment
// Description: /info/<slug>: one published info page, its Markdown rendered safely. Drafts
//              and unknown slugs show the 404 page.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import Markdown from '../components/Markdown.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function InfoPage() {
  const { slug } = useParams();
  // { page } once loaded, { missing: true } for 404, { error } for anything else.
  const [state, setState] = useState(null);

  useEffect(() => {
    let current = true;
    api(`/info/${encodeURIComponent(slug)}`)
      .then((data) => current && setState({ page: data.page }))
      .catch(
        (err) =>
          current && setState(err.status === 404 ? { missing: true } : { error: err.message })
      );
    return () => {
      current = false;
    };
  }, [slug]);

  if (state?.missing) return <NotFoundPage />;
  return (
    <article className="page">
      <p>
        <Link to="/info">← All info pages</Link>
      </p>
      <FormMessage error={state?.error} />
      {state?.page && (
        <>
          <h1>{state.page.title}</h1>
          <Markdown text={state.page.body} />
        </>
      )}
    </article>
  );
}
