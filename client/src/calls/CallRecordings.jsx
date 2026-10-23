// ============================================================
// File:        CallRecordings.jsx
// Path:        client/src/calls/CallRecordings.jsx
// Project:     Seasonal Entertainment
// Description: A call's recordings on its page (docs/CALLS.md, "Recording"), each a
//              RecordingItem (date, length, player, chapters; organisers and admins delete one
//              or edit its chapters). Shown to everyone who can see the call; nothing when there
//              are none.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import RecordingItem from './RecordingItem.jsx';

// callId; canManage: organisers and admins (delete, chapters); version: reload when it changes.
export default function CallRecordings({ callId, canManage, version }) {
  const [recordings, setRecordings] = useState([]);
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

  if (recordings.length === 0) return null;
  return (
    <section aria-labelledby="call-recordings-title">
      <h2 id="call-recordings-title">Recordings</h2>
      <ul className="recording-list">
        {recordings.map((r) => (
          <RecordingItem
            key={r.id}
            callId={callId}
            recording={r}
            canManage={canManage}
            onChanged={load}
          />
        ))}
      </ul>
    </section>
  );
}
