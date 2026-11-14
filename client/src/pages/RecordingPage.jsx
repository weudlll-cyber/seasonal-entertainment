// ============================================================
// File:        RecordingPage.jsx
// Path:        client/src/pages/RecordingPage.jsx
// Project:     Seasonal Entertainment
// Description: /recordings/:id, the page a shared recording link opens (docs/CALLS.md, "Sharing a
//              recording"): only that recording, for everyone: its call's title, a link to the
//              call, and the recording as in a list (RecordingItem: date, length, player,
//              "Share", chapters; organisers and admins edit and delete, and after a delete the
//              page goes to the archive), and for organisers and admins the choice of its
//              preview image (RecordingPreviewPicker). A recording that does not exist (or no
//              longer) shows
//              the normal "Page not found". The preview card's meta tags come from the server
//              (server/src/calls/recordingShare.js), not from this page.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/http.js';
import PageHeader from '../brand/PageHeader.jsx';
import RecordingItem from '../calls/RecordingItem.jsx';
import RecordingPreviewPicker from '../calls/RecordingPreviewPicker.jsx';
import { FormMessage } from '../components/FormField.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function RecordingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [answer, setAnswer] = useState(null); // { canManage, recording }; null while loading
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(null);
  const load = useCallback(
    () =>
      api(`/calls/recordings/${encodeURIComponent(id)}`)
        .then(setAnswer)
        .catch((err) => (err.status === 404 ? setMissing(true) : setError(err.message))),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <NotFoundPage />;
  const recording = answer?.recording;
  return (
    <section className="page page--wide">
      <PageHeader quarter="calls" title={recording?.title ?? 'Recording'} />
      <FormMessage error={error} />
      {recording && (
        <>
          <p>
            <Link to={`/calls/${recording.callId}`}>To the call</Link> ·{' '}
            <Link to="/calls/recordings">All recordings</Link>
          </p>
          <ul className="recording-list" aria-label="Recording">
            <RecordingItem
              callId={recording.callId}
              recording={recording}
              canManage={answer.canManage}
              onChanged={load}
              onDeleted={() => navigate('/calls/recordings')}
            />
          </ul>
          {answer.canManage && (
            <RecordingPreviewPicker
              callId={recording.callId}
              recording={recording}
              onChanged={load}
            />
          )}
        </>
      )}
    </section>
  );
}
