// ============================================================
// File:        AdminSettingsPage.jsx
// Path:        client/src/admin/AdminSettingsPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin site settings (/admin/settings): every setting the server defines, in
//              its group (Chat, Other sites, Calls, …, in the server's order), each saved on
//              its own (SettingForm.jsx; every change is audited).
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import SettingForm from './SettingForm.jsx';

export default function AdminSettingsPage() {
  const [answer, setAnswer] = useState(null); // { groups, settings }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api('/admin/settings')
      .then(setAnswer)
      .catch((err) => setError(err.message));
  }, []);

  function saved(settings) {
    setAnswer((before) => ({ ...before, settings }));
    setNotice('Saved.');
  }

  // Only groups that hold a setting; each group's settings in the server's order.
  const groups = (answer?.groups ?? [])
    .map((name) => ({ name, settings: answer.settings.filter((s) => s.group === name) }))
    .filter((group) => group.settings.length > 0);

  return (
    <>
      <h2>Settings</h2>
      <p>Each setting starts at the site's usual behaviour; a change takes effect at once.</p>
      <FormMessage error={error} notice={notice} />
      {groups.map((group) => (
        <section key={group.name} className="settings-group" aria-label={group.name}>
          <h3>{group.name}</h3>
          <div className="settings-group__list">
            {group.settings.map((setting) => (
              // Keyed by the stored value too: a save shows the server's value afresh.
              <SettingForm
                key={`${setting.key}:${setting.value}`}
                setting={setting}
                onSaved={saved}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
