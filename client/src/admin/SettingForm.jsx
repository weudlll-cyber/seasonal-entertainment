// ============================================================
// File:        SettingForm.jsx
// Path:        client/src/admin/SettingForm.jsx
// Project:     Seasonal Entertainment
// Description: One site setting on Admin → Settings, drawn by its kind (server
//              settings/types.js): on/off as a checkbox, a whole number with its unit and
//              bounds, a short text with its length, a choice as a list. The explanation, the
//              bounds and the default sit under the field; Save sends the value as its kind.
// ============================================================

import { useId, useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

// How a value reads on the page: on/off, an empty text, a choice by its label.
function shown(setting, value) {
  if (setting.type === 'boolean') return value ? 'on' : 'off';
  if (setting.type === 'choice') return setting.choices.find((c) => c.value === value)?.label;
  if (setting.type === 'text') return value ? `"${value}"` : 'empty';
  return `${value}${setting.unit ? ` ${setting.unit}` : ''}`;
}

function hintOf(setting) {
  const bounds =
    setting.type === 'integer'
      ? ` ${setting.min}–${setting.max} ${setting.unit ?? ''}`.trimEnd() + ';'
      : setting.type === 'text'
        ? ` At most ${setting.maxLength} characters;`
        : '';
  return `${setting.help}${bounds} default ${shown(setting, setting.default)}.`;
}

// The value as the server expects it: a number field holds text until it is sent.
const outgoing = (setting, value) => (setting.type === 'integer' ? Number(value) : value);

function Control({ setting, value, onChange, hint }) {
  const hintId = useId();
  if (setting.type === 'boolean') {
    return (
      <div className="form-field">
        <label className="form-check">
          <input
            type="checkbox"
            checked={value}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="form-field__label">{setting.label}</span>
        </label>
        <span id={hintId} className="form-field__hint">
          {hint}
        </span>
      </div>
    );
  }
  if (setting.type === 'choice') {
    return (
      <div className="form-field">
        <label>
          <span className="form-field__label">{setting.label}</span>
          <select
            value={value}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.value)}
          >
            {setting.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <span id={hintId} className="form-field__hint">
          {hint}
        </span>
      </div>
    );
  }
  const number = setting.type === 'integer';
  return (
    <FormField
      label={setting.label}
      hint={hint}
      type={number ? 'number' : 'text'}
      {...(number
        ? { min: setting.min, max: setting.max, step: 1, required: true }
        : { maxLength: setting.maxLength })}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function SettingForm({ setting, onSaved }) {
  const [value, setValue] = useState(
    setting.type === 'integer' ? String(setting.value) : setting.value
  );
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    setError(null);
    try {
      const data = await api(`/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: { value: outgoing(setting, value) },
      });
      onSaved(data.settings);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" aria-label={setting.label} onSubmit={save}>
      <Control setting={setting} value={value} onChange={setValue} hint={hintOf(setting)} />
      <FormMessage error={error} />
      <button className="button" type="submit">
        Save
      </button>
    </form>
  );
}
