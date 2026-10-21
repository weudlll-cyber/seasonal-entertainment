// ============================================================
// File:        AdminDirectReports.jsx
// Path:        client/src/admin/AdminDirectReports.jsx
// Project:     Seasonal Entertainment
// Description: The admin chat page's "Reported private conversations": who reported whom and
//              why. When the reporter chose to share messages, "Show shared messages" loads the
//              copies (every view is audited on the server), labelled as content provided by
//              the reporter. "Mark reviewed" closes a report; its copies are deleted 90 days
//              later. Moderators can read no private message in any other way.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormMessage } from '../components/FormField.jsx';

export const SHARED_LABEL =
  'Shared by the reporter from a private conversation — content as provided by the reporter';

function SharedCopies({ reportId }) {
  const [copies, setCopies] = useState(null);
  const [error, setError] = useState(null);
  if (!copies) {
    return (
      <>
        <button
          className="link-button"
          type="button"
          onClick={() =>
            api(`/chat/direct-reports/${reportId}/copies`)
              .then((data) => setCopies(data.copies))
              .catch((err) => setError(err.message))
          }
        >
          Show shared messages
        </button>
        <FormMessage error={error} />
      </>
    );
  }
  return (
    <figure className="card">
      <figcaption>{SHARED_LABEL}</figcaption>
      <ul aria-label="Shared messages">
        {copies.map((c) => (
          <li key={c.messageId}>
            <strong>{c.author}</strong> ({formatWhen(c.sentAt)}): {c.text || '(sticker or GIF)'}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default function AdminDirectReports() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api('/chat/direct-reports')
        .then((data) => setReports(data.reports))
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function review(id) {
    try {
      await api(`/chat/direct-reports/${id}/reviewed`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h3>Reported private conversations</h3>
      <FormMessage error={error} />
      {reports.length === 0 && <p>No open reports.</p>}
      <ul className="link-list">
        {reports.map((r) => (
          <li key={r.id}>
            <strong>{r.reporter}</strong> reported a private conversation with{' '}
            <strong>{r.partner}</strong>: <q>{r.reason}</q>{' '}
            {r.shared > 0 ? <SharedCopies reportId={r.id} /> : '(no messages shared)'}{' '}
            <button className="link-button" type="button" onClick={() => review(r.id)}>
              Mark reviewed
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
