// ============================================================
// File:        RecoveryCodeShown.jsx
// Path:        client/src/keys/RecoveryCodeShown.jsx
// Project:     Seasonal Entertainment
// Description: A new recovery code, shown this one time: the code, a "Copy" button, and the
//              required checkbox "I have saved my recovery code" before "Done" can be pressed.
//              The code lives only in this component's memory; it is never stored.
// ============================================================

import { useState } from 'react';

export default function RecoveryCodeShown({ code, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // No clipboard (blocked or unsupported): the code is still there to write down.
    }
  }

  return (
    <div className="recovery-code">
      <p>
        Your recovery code. <strong>It is shown only now.</strong> Keep it somewhere safe, away from
        this device.
      </p>
      <p className="recovery-code__value">
        <code aria-label="Recovery code">{code}</code>
      </p>
      <button type="button" className="button button--secondary" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <label className="form-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I have saved my recovery code</span>
      </label>
      <button type="button" className="button" disabled={!saved} onClick={onDone}>
        Done
      </button>
    </div>
  );
}
