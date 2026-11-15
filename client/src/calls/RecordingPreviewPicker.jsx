// ============================================================
// File:        RecordingPreviewPicker.jsx
// Path:        client/src/calls/RecordingPreviewPicker.jsx
// Project:     Seasonal Entertainment
// Description: Choosing a recording's preview image on its own page (pages/RecordingPage.jsx;
//              docs/CALLS.md, "A recording's preview image"; decided 2026-11-14), for organisers
//              and admins only (canManage): the image shown now (the chosen one, or the site's
//              logo), a slider through the video with "Use this frame" (the frame is taken in
//              the browser, captureFrame.js, and uploaded as an image), "Upload an image" (the
//              chat images' rules, checked by the server) and, once one is chosen, "Back to the
//              logo". The share card and the players' still image follow the choice.
// ============================================================

import { useRef, useState } from 'react';
import { formatDuration } from '@seasonal-entertainment/shared/chapterRules.js';
import { api, upload } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { PICTURE_TYPES } from '../components/pictureTypes.js';
import { captureFrame } from './captureFrame.js';

const LOGO = '/brand/logo.webp';

// recording: { id, seconds, preview: { full, thumb } | null }; onChanged: reload after a change.
export default function RecordingPreviewPicker({ callId, recording, onChanged }) {
  const video = useRef(null);
  const file = useRef(null);
  // The slider's end: the file's own length once the player knows it, else the stored one.
  const [length, setLength] = useState(recording.seconds ?? 0);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const address = `/calls/${callId}/recordings/${recording.id}/preview`;

  // Every change goes the same way: one request at a time, then the page reloads the recording.
  async function change(request, done) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request();
      setNotice(done);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function seek(seconds) {
    setAt(seconds);
    video.current.currentTime = seconds;
  }

  return (
    <section className="recording-preview" aria-labelledby="recording-preview-title">
      <h2 id="recording-preview-title">Preview image</h2>
      <p>The picture shown where the link to this recording is posted.</p>
      <figure className="recording-preview__now">
        <img src={recording.preview?.thumb ?? LOGO} alt="" />
        <figcaption>{recording.preview ? 'The chosen image' : 'The site’s logo'}</figcaption>
      </figure>

      <div className="recording-preview__frame">
        <video
          ref={video}
          muted
          playsInline
          preload="auto"
          src={`/api/calls/${callId}/recordings/${recording.id}/video`}
          aria-label="The frame to use"
          onLoadedMetadata={(event) => {
            const seconds = Math.floor(event.currentTarget.duration);
            if (Number.isFinite(seconds) && seconds > 0) setLength(seconds);
          }}
        />
        <label className="recording-preview__slider">
          Frame at {formatDuration(at)}
          <input
            type="range"
            min="0"
            max={length}
            step="1"
            value={at}
            onChange={(event) => seek(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() =>
            change(
              async () => upload(address, await captureFrame(video.current), {}),
              'This frame is now the preview image.'
            )
          }
        >
          Use this frame
        </button>
      </div>

      <p className="recording-preview__actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={busy}
          onClick={() => file.current.click()}
        >
          Upload an image
        </button>
        <input
          ref={file}
          type="file"
          accept={PICTURE_TYPES}
          hidden
          aria-label="Image file"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            if (chosen) change(() => upload(address, chosen, {}), 'The image is now the preview.');
          }}
        />
        {recording.preview && (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() =>
              change(
                () => api(address, { method: 'DELETE' }),
                'The preview is the site’s logo again.'
              )
            }
          >
            Back to the logo
          </button>
        )}
      </p>
      <FormMessage error={error} notice={notice} />
    </section>
  );
}
