// ============================================================
// File:        AdminSettingsPage.jsx
// Path:        client/src/admin/AdminSettingsPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin site settings (/admin/settings): every setting the server defines, as a
//              whole number within its range, saved one at a time (each change is audited).
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

function SettingForm({ setting, onSaved }) {
  const [value, setValue] = useState(String(setting.value));
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    setError(null);
    try {
      const data = await api(`/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: { value: Number(value) },
      });
      onSaved(data.settings);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form card" aria-label={setting.label} onSubmit={save}>
      <FormField
        label={setting.label}
        hint={`${setting.min}–${setting.max}; default ${setting.default}`}
        type="number"
        min={setting.min}
        max={setting.max}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      />
      <FormMessage error={error} />
      <button className="button" type="submit">
        Save
      </button>
    </form>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api('/admin/settings')
      .then((data) => setSettings(data.settings))
      .catch((err) => setError(err.message));
  }, []);

  function saved(next) {
    setSettings(next);
    setNotice('Saved.');
  }

  return (
    <>
      <h2>Settings</h2>
      <FormMessage error={error} notice={notice} />
      {settings?.map((setting) => (
        <SettingForm key={`${setting.key}:${setting.value}`} setting={setting} onSaved={saved} />
      ))}
    </>
  );
}
