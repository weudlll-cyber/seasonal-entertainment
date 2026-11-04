// ============================================================
// File:        RepeatPasswordField.jsx
// Path:        client/src/components/RepeatPasswordField.jsx
// Project:     Seasonal Entertainment
// Description: "Repeat password" for every form that sets a new password (registration, the
//              first password of an account made with Discord, the password change, the admin's
//              reset), so a typo cannot slip in unnoticed. Checked in the browser only: the
//              repeat never goes to the server. A mismatch blocks the form, and the message
//              shows at this field. The password rules stay the forms' own validatePassword
//              (shared/accountRules.js), checked before this.
// ============================================================

import { useId, useState } from 'react';

export const PASSWORDS_DIFFER = 'The passwords do not match.';

// name: the new-password field's name; its repeat is `${name}Repeat`. matches(formData): true
// when both are the same, otherwise false and the message shows at the field.
export function useRepeatPassword(name) {
  const [mismatch, setMismatch] = useState(false);
  const matches = (form) => {
    const same = form.get(name) === form.get(`${name}Repeat`);
    setMismatch(!same);
    return same;
  };
  return { matches, fieldProps: { name: `${name}Repeat`, mismatch } };
}

// ariaLabel: for a compact form without visible labels (the admin's user row).
export function RepeatPasswordField({ name, mismatch, ariaLabel }) {
  const messageId = useId();
  const input = (
    <input
      name={name}
      type="password"
      autoComplete="new-password"
      aria-label={ariaLabel}
      aria-invalid={mismatch || undefined}
      aria-describedby={mismatch ? messageId : undefined}
    />
  );
  const message = mismatch && (
    <span id={messageId} className="form-field__error" role="alert">
      {PASSWORDS_DIFFER}
    </span>
  );
  if (ariaLabel) {
    return (
      <>
        {input}
        {message}
      </>
    );
  }
  return (
    <div className="form-field">
      <label>
        <span className="form-field__label">Repeat password</span>
        {input}
      </label>
      {message}
    </div>
  );
}
