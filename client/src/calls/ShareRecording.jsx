// ============================================================
// File:        ShareRecording.jsx
// Path:        client/src/calls/ShareRecording.jsx
// Project:     Seasonal Entertainment
// Description: The "Share" button of a recording (RecordingItem.jsx: a call's page, the archive
//              and the recording's own page; docs/CALLS.md, "Sharing a recording"): its stable
//              link, /recordings/<id>, which shows a preview card where it is posted. On a
//              phone with the system's share sheet (navigator.share, touch-first screens) that
//              sheet opens; elsewhere the link is copied with "Link copied" as confirmation.
//              Without a clipboard (blocked) the link is shown to copy by hand. The copying
//              follows the recovery code's (keys/RecoveryCodeShown.jsx).
// ============================================================

import { useState } from 'react';

// A phone or tablet: the share sheet is the natural way there; on a desktop browser that also
// has navigator.share (Edge, Safari) a copied link is what people expect.
const sharesBySheet = () =>
  typeof navigator.share === 'function' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

export default function ShareRecording({ recordingId, title }) {
  const [state, setState] = useState(null); // null | 'copied' | 'manual'
  const url = `${window.location.origin}/recordings/${recordingId}`;

  async function share() {
    if (sharesBySheet()) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // Closing the sheet is a choice, not a failure; any other refusal falls back to copying.
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('manual');
    }
  }

  return (
    <p className="recording-share">
      <button type="button" className="button button--secondary" onClick={share}>
        Share
      </button>{' '}
      <span role="status">
        {state === 'copied' && 'Link copied'}
        {state === 'manual' && (
          <>
            Copy this link: <a href={url}>{url}</a>
          </>
        )}
      </span>
    </p>
  );
}
