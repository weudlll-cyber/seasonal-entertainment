// ============================================================
// File:        RecordingsPage.jsx
// Path:        client/src/pages/RecordingsPage.jsx
// Project:     Seasonal Entertainment
// Description: /calls/recordings, the recordings archive (docs/CALLS.md, "Recording"): every
//              recording the viewer may see (the calls' audience: everyone), newest first, each
//              with its call's title (linking to the call), date, length, player and chapters
//              (RecordingItem.jsx), and a search over the call titles. Linked from the Calls
//              page and the weekly recap.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import PageHeader from '../brand/PageHeader.jsx';
import RecordingItem from '../calls/RecordingItem.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';

const LEAD = 'Every recorded community call, newest first.';

export default function RecordingsPage() {
  const [answer, setAnswer] = useState(null); // { canManage, recordings }; null while loading
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api('/calls/recordings')
        .then(setAnswer)
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const words = query.trim().toLowerCase();
  const shown = (answer?.recordings ?? []).filter((r) => r.title.toLowerCase().includes(words));
  return (
    <section className="page page--wide">
      <PageHeader quarter="calls" title="Recordings" lead={LEAD} />
      <p>
        <Link to="/calls">All calls</Link>
      </p>
      <FormMessage error={error} />
      {answer && answer.recordings.length === 0 && <p>No recordings yet.</p>}
      {answer && answer.recordings.length > 0 && (
        <>
          <FormField
            label="Search by call title"
            type="search"
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {shown.length === 0 ? (
            <p>No recording matches.</p>
          ) : (
            <ul className="recording-list" aria-label="Recordings">
              {shown.map((r) => (
                <RecordingItem
                  key={r.id}
                  callId={r.callId}
                  recording={r}
                  title={r.title}
                  canManage={answer.canManage}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
