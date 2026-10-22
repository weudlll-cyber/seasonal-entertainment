// ============================================================
// File:        RecordingConsent.jsx
// Path:        client/src/calls/RecordingConsent.jsx
// Project:     Seasonal Entertainment
// Description: The question before joining a call that is being recorded, or before turning on
//              the microphone, camera or a screen share in one (docs/CALLS.md, "Recording"):
//              nothing connects or is sent until the member answers "I understand this call is
//              being recorded"; "Not now" leaves everything as it was. A modal dialog: focus
//              moves in, Escape is "Not now".
// ============================================================

import { useEffect, useRef } from 'react';

export default function RecordingConsent({ onConfirm, onDecline }) {
  const dialog = useRef(null);
  useEffect(() => dialog.current?.focus(), []);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-consent-title"
        tabIndex={-1}
        onKeyDown={(event) => event.key === 'Escape' && onDecline()}
      >
        <h2 id="recording-consent-title">This call is being recorded</h2>
        <p>
          Sound, video and shared screens in this call are recorded while the recording runs. The
          recording is shown on the call&apos;s page afterwards to everyone who can see the call.
        </p>
        <div className="modal__actions">
          <button type="button" className="button" onClick={onConfirm}>
            I understand this call is being recorded
          </button>
          <button type="button" className="button button--secondary" onClick={onDecline}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
