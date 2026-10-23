// ============================================================
// File:        RecordingItem.jsx
// Path:        client/src/calls/RecordingItem.jsx
// Project:     Seasonal Entertainment
// Description: One recording in a list (a call's page, CallRecordings.jsx; the archive,
//              pages/RecordingsPage.jsx; docs/CALLS.md, "Recording"): in the archive its call's
//              title linking to the call; its date in the site's format, its length (the
//              file's own; none while unknown) and a player (the video streams from this site;
//              seeking asks for parts of it); its chapters (RecordingChapters); organisers and
//              admins delete it (file and row), after a question.
// ============================================================

import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatDuration } from '@seasonal-entertainment/shared/chapterRules.js';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormMessage } from '../components/FormField.jsx';
import RecordingChapters from './RecordingChapters.jsx';
import './recordings.css';

// recording: { id, startedAt, seconds, chapters }; title: the call's (archive) or none;
// onChanged: reload the list after a change.
export default function RecordingItem({ callId, recording, title, canManage, onChanged }) {
  const video = useRef(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const when = formatWhen(recording.startedAt);

  async function remove() {
    setAsking(false);
    try {
      await api(`/calls/${callId}/recordings/${recording.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <li className="recording">
      {title && (
        <h2 className="recording__title">
          <Link to={`/calls/${callId}`}>{title}</Link>
        </h2>
      )}
      <p>
        {when}
        {recording.seconds !== null && ` · ${formatDuration(recording.seconds)}`}
      </p>
      <video
        ref={video}
        controls
        preload="metadata"
        src={`/api/calls/${callId}/recordings/${recording.id}/video`}
        aria-label={`Recording of ${when}`}
      />
      <RecordingChapters
        callId={callId}
        recording={recording}
        canManage={canManage}
        onSeek={(seconds) => {
          video.current.currentTime = seconds;
        }}
        onChanged={onChanged}
      />
      {canManage && !asking && (
        <button className="button button--secondary" type="button" onClick={() => setAsking(true)}>
          Delete recording
        </button>
      )}
      {canManage && asking && (
        <p role="group" aria-label="Delete this recording">
          Delete this recording for good?{' '}
          <button type="button" className="button" onClick={remove}>
            Delete
          </button>{' '}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setAsking(false)}
          >
            Keep it
          </button>
        </p>
      )}
      <FormMessage error={error} />
    </li>
  );
}
