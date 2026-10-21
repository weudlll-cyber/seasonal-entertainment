// ============================================================
// File:        SafetyNumberDialog.jsx
// Path:        client/src/chat/SafetyNumberDialog.jsx
// Project:     Seasonal Entertainment
// Description: "Verify safety number" of a direct conversation (docs/CHAT.md, "Safety
//              numbers"): the 60 digits in 12 groups, what to do with them in plain English,
//              and "Mark as verified" (or removing the mark) for this device. A modal dialog
//              like the report dialog: focus moves in, Escape closes.
// ============================================================

import { useEffect, useRef } from 'react';

// safety: useSafetyNumber's answer; partnerName; onClose().
export default function SafetyNumberDialog({ safety, partnerName, onClose }) {
  const dialog = useRef(null);
  useEffect(() => dialog.current?.focus(), []);
  const title = `Safety number with ${partnerName}`;

  return (
    <div className="chat-dialog-backdrop">
      <div
        ref={dialog}
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation(); // closes this dialog only, not a drawer around it
          onClose();
        }}
      >
        <p className="chat-panel__title">{title}</p>
        {safety.number ? (
          <ol className="chat-safety__number" aria-label="Safety number">
            {safety.number.map((group, i) => (
              <li key={i}>{group}</li>
            ))}
          </ol>
        ) : (
          <p className="chat-note">Making the number…</p>
        )}
        <p>
          Compare these numbers with {partnerName} outside this site: in person, on a call, or in
          another app you trust. You both see the same numbers when nobody stands between you, not
          even this site&apos;s server. If they match, mark them as verified. If they do not match,
          do not send anything private and tell an admin.
        </p>
        <p className="chat-note">
          The mark is kept on this device only. When {partnerName}&apos;s security key or yours
          changes, the number changes and the mark goes away.
        </p>
        {safety.verified && <p className="chat-safety__done">Verified on this device.</p>}
        <div className="chat-dialog__actions">
          {safety.verified ? (
            <button
              type="button"
              className="chat-button chat-button--secondary"
              onClick={safety.unmark}
            >
              Remove the verified mark
            </button>
          ) : (
            <button
              type="button"
              className="chat-button"
              disabled={!safety.number}
              onClick={safety.mark}
            >
              Mark as verified
            </button>
          )}
          <button type="button" className="chat-button chat-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
