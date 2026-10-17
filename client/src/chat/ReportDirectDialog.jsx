// ============================================================
// File:        ReportDirectDialog.jsx
// Path:        client/src/chat/ReportDirectDialog.jsx
// Project:     Seasonal Entertainment
// Description: Reporting a direct message (docs/CHAT.md, "Reporting a direct message"): a
//              reason, the messages of this conversation up to the reported one (it is
//              selected, earlier ones can be), and the checkbox "Share the selected messages
//              with the moderators". Only when it is ticked are the selected messages sent, as
//              copies of what this browser decrypted; without it the moderators get the reason
//              and the fact that a private conversation was reported. A modal dialog: focus
//              moves in, Escape cancels.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import ChatNotice from './ChatNotice.jsx';

// messages: the conversation's decrypted messages; reported: the one reported; partnerName.
// onSend(body) resolves true when the report went out; onClose().
export default function ReportDirectDialog({ messages, reported, partnerName, onSend, onClose }) {
  const candidates = messages.filter((m) => m.payload && m.id <= reported.id);
  const [selected, setSelected] = useState(() => new Set([reported.id]));
  const [share, setShare] = useState(false);
  const [error, setError] = useState(null);
  const dialog = useRef(null);

  useEffect(() => dialog.current?.focus(), []);

  function toggle(id) {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason').trim();
    if (!reason) return setError('Please give a reason.');
    const body = { messageId: reported.id, reason };
    // Without consent, no message content leaves this browser.
    if (share) {
      body.shared = candidates
        .filter((m) => selected.has(m.id))
        .map((m) => ({
          id: m.id,
          text: m.payload.text ?? '',
          ...(m.payload.mediaItemId && { mediaItemId: m.payload.mediaItemId }),
        }));
    }
    setError(null);
    if (await onSend(body)) onClose();
    else setError('The report could not be sent.');
  }

  return (
    <div className="chat-dialog-backdrop">
      <form
        ref={dialog}
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Report a message from ${partnerName}`}
        tabIndex={-1}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation(); // closes this dialog only, not a drawer around it
          onClose();
        }}
      >
        <p className="chat-panel__title">Report a message from {partnerName}</p>
        <label>
          <span className="chat-label">Reason</span>
          <textarea name="reason" rows={2} maxLength={1000} required />
        </label>
        <fieldset className="chat-dialog__messages">
          <legend>Messages</legend>
          {candidates.map((m) => (
            <label key={m.id} className="chat-dialog__message">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
              <span>{m.payload.text || '(sticker or GIF)'}</span>
            </label>
          ))}
        </fieldset>
        <label className="chat-dialog__share">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>Share the selected messages with the moderators</span>
        </label>
        <p className="chat-note">
          {share
            ? 'Copies of the selected messages, as your browser shows them, go to the moderators.'
            : 'Without this, the moderators only see your reason and that a private conversation was reported.'}
        </p>
        <ChatNotice error={error} />
        <div className="chat-dialog__actions">
          <button type="submit" className="chat-button">
            Send report
          </button>
          <button type="button" className="chat-button chat-button--secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
