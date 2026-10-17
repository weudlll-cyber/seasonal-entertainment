// ============================================================
// File:        InfoEditorPage.jsx
// Path:        client/src/admin/InfoEditorPage.jsx
// Project:     Seasonal Entertainment
// Description: Create or edit one info page: address (slug), title, Markdown body with a live
//              preview (the same renderer the public page uses), save, publish/unpublish.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';
import Markdown from '../components/Markdown.jsx';

const EMPTY = { slug: '', title: '', body: '', status: 'draft' };

export default function InfoEditorPage() {
  const { id } = useParams(); // "new" for a new page
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [page, setPage] = useState(isNew ? EMPTY : null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (isNew) return;
    api(`/admin/info/${id}`)
      .then((data) => setPage(data.page))
      .catch((err) => setError(err.message));
  }, [id, isNew]);

  const field = (name) => (event) => setPage({ ...page, [name]: event.target.value });

  async function save(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const body = { slug: page.slug, title: page.title, body: page.body };
    try {
      if (isNew) {
        const data = await api('/admin/info', { method: 'POST', body });
        navigate(`/admin/info/${data.page.id}`, { replace: true });
      } else {
        const data = await api(`/admin/info/${id}`, { method: 'PUT', body });
        setPage(data.page);
        setNotice('Saved.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function setStatus(status) {
    setError(null);
    try {
      await api(`/admin/info/${id}/status`, { method: 'POST', body: { status } });
      setPage({ ...page, status });
      setNotice(
        status === 'published' ? 'Published: visible to everyone.' : 'Unpublished: now a draft.'
      );
    } catch (err) {
      setError(err.message);
    }
  }

  if (!page) return <FormMessage error={error} />;
  return (
    <>
      <p>
        <Link to="/admin/info">← All info pages</Link>
      </p>
      <h2>{isNew ? 'New info page' : `Edit: ${page.title}`}</h2>
      {!isNew && (
        <p>
          Status: <strong>{page.status}</strong>{' '}
          {page.status === 'draft' ? (
            <button className="button" type="button" onClick={() => setStatus('published')}>
              Publish
            </button>
          ) : (
            <button className="button" type="button" onClick={() => setStatus('draft')}>
              Unpublish
            </button>
          )}
        </p>
      )}
      <div className="editor">
        <form className="form editor__form" onSubmit={save}>
          <FormField
            label="Address"
            name="slug"
            type="text"
            value={page.slug}
            onChange={field('slug')}
            hint={`Shown as /info/${page.slug || '…'}: lowercase letters, digits and "-".`}
            required
          />
          <FormField
            label="Title"
            name="title"
            type="text"
            value={page.title}
            onChange={field('title')}
            required
          />
          <label className="form-field">
            <span className="form-field__label">Text (Markdown)</span>
            <textarea name="body" rows={20} value={page.body} onChange={field('body')} />
          </label>
          <FormMessage error={error} notice={notice} />
          <button className="button" type="submit">
            Save
          </button>
        </form>
        <section className="editor__preview" aria-label="Preview">
          <h3>Preview</h3>
          <h1>{page.title}</h1>
          <Markdown text={page.body} />
        </section>
      </div>
    </>
  );
}
