// ============================================================
// File:        FormField.jsx
// Path:        client/src/components/FormField.jsx
// Project:     Seasonal Entertainment
// Description: Labelled input and the shared form error/notice line, so every form on the
//              site looks and reads the same.
// ============================================================

import { useId } from 'react';

// The hint is linked with aria-describedby, not put inside the label: inside, it would
// become part of the field's accessible name.
export function FormField({ label, hint, ...inputProps }) {
  const hintId = useId();
  return (
    <div className="form-field">
      <label>
        <span className="form-field__label">{label}</span>
        <input {...inputProps} aria-describedby={hint ? hintId : undefined} />
      </label>
      {hint && (
        <span id={hintId} className="form-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}

// role="alert" makes screen readers announce the message when it appears.
export function FormMessage({ error, notice }) {
  if (error) {
    return (
      <p className="form-message form-message--error" role="alert">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="form-message form-message--notice" role="status">
        {notice}
      </p>
    );
  }
  return null;
}
