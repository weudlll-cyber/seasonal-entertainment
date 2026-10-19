// ============================================================
// File:        BusyButton.jsx
// Path:        client/src/components/BusyButton.jsx
// Project:     Seasonal Entertainment
// Description: The submit button of a password form: while its work runs (the password's key
//              derivation, then the request) it is disabled and reads "Checking…", so a
//              second of Argon2id never looks like a dead button.
// ============================================================

export function BusyButton({ busy, children, className = 'button' }) {
  return (
    <button className={className} type="submit" disabled={busy} aria-busy={busy}>
      {busy ? 'Checking…' : children}
    </button>
  );
}
