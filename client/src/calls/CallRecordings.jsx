// ============================================================
// File:        CallRecordings.jsx
// Path:        client/src/calls/CallRecordings.jsx
// Project:     Seasonal Entertainment
// Description: A call's recordings on its page (docs/CALLS.md, "Recording"): each with its date
//              in the site's format, its length (the file's own; none while unknown) and a player
//              (the video streams from this site;
//              seeking asks for parts of it). Shown to everyone who can see the call; organisers
//              and admins can delete one (file and row), after a question. Nothing when there
//              are none.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormMessage } from '../components/FormField.jsx';

// 75 -> "1:15"; 3725 -> "1:02:05".
export function lengthText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// callId; canManage: organisers and admins (delete); version: reload when it changes.
export default function CallRecordings({ callId, canManage, version }) {
  const [recordings, setRecordings] = useState([]);
  const [asking, setAsking] = useState(null); // the recording whose deletion is asked
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api(`/calls/${callId}/recordings`)
        .then((data) => setRecordings(data.recordings))
        .catch(() => setRecordings([])),
    [callId]
  );
  useEffect(() => {
    load();
  }, [load, version]);

  async function remove(recording) {
    setAsking(null);
    try {
      await api(`/calls/${callId}/recordings/${recording.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (recordings.length === 0) return null;
  return (
    <section className="call-recordings" aria-labelledby="call-recordings-title">
      <h2 id="call-recordings-title">Recordings</h2>
      <ul>
        {recordings.map((r) => (
          <li key={r.id} className="call-recording">
            <p>
              {formatWhen(r.startedAt)}
              {r.seconds !== null && ` · ${lengthText(r.seconds)}`}
            </p>
            <video
              controls
              preload="metadata"
              src={`/api/calls/${callId}/recordings/${r.id}/video`}
              aria-label={`Recording of ${formatWhen(r.startedAt)}`}
            />
            {canManage && asking !== r.id && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setAsking(r.id)}
              >
                Delete recording
              </button>
            )}
            {canManage && asking === r.id && (
              <p role="group" aria-label="Delete this recording">
                Delete this recording for good?{' '}
                <button type="button" className="button" onClick={() => remove(r)}>
                  Delete
                </button>{' '}
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setAsking(null)}
                >
                  Keep it
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>
      <FormMessage error={error} />
    </section>
  );
}
