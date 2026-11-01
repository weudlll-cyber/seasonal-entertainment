// ============================================================
// File:        BannerPage.jsx
// Path:        client/src/pages/BannerPage.jsx
// Project:     Seasonal Entertainment
// Description: Site banner (/banner), for organisers and admins: whether the banner is on the
//              site now, its settings (on/off, text, link, style; the server's "Site banner"
//              group, /api/banner) drawn as on Admin → Settings, a live preview of the values
//              being edited, and one Save for all changed values (each change is audited).
// ============================================================

import { useEffect, useState } from 'react';
import { hintOf, SettingControl } from '../admin/SettingForm.jsx';
import { api } from '../api/http.js';
import { BannerLine } from '../app/SiteBanner.jsx';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';

const valuesOf = (settings) => Object.fromEntries(settings.map((s) => [s.key, s.value]));
// The banner shows only while it is on and has a text (SiteBanner.jsx).
const shows = (values) => Boolean(values['banner.enabled'] && values['banner.text']);

export default function BannerPage() {
  const { refresh } = useSession();
  const [settings, setSettings] = useState(null); // as stored: [{ key, label, …, value }]
  const [values, setValues] = useState({}); // as edited: { key: value }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function show(stored) {
    setSettings(stored);
    setValues(valuesOf(stored));
  }

  useEffect(() => {
    api('/banner')
      .then((data) => show(data.settings))
      .catch((err) => setError(err.message));
  }, []);

  const stored = valuesOf(settings ?? []);
  // Only what was changed is sent, so the audit log lists only real changes.
  const changed = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== stored[key])
  );

  async function save(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const data = await api('/banner', { method: 'PUT', body: { values: changed } });
      show(data.settings);
      setNotice('Saved. Visitors see it when they next open the site.');
      refresh(); // this browser's own banner, at the top, at once
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <h1>Site banner</h1>
      <p>One line at the top of every page, for everyone. Each change is recorded.</p>
      {settings && (
        <p>
          <strong>Now on the site:</strong>{' '}
          {shows(stored) ? `shown to everyone ("${stored['banner.text']}")` : 'off'}
        </p>
      )}
      <FormMessage error={error} notice={notice} />
      {settings && (
        <form className="form" aria-label="Site banner" onSubmit={save}>
          {settings.map((setting) => (
            <SettingControl
              key={setting.key}
              setting={setting}
              value={values[setting.key]}
              onChange={(value) => setValues((before) => ({ ...before, [setting.key]: value }))}
              hint={hintOf(setting)}
            />
          ))}
          <section aria-label="Preview">
            <h2>Preview</h2>
            {shows(values) ? (
              <BannerLine
                text={values['banner.text']}
                link={values['banner.link']}
                style={values['banner.style']}
                announce={false}
              />
            ) : (
              <p>Nobody sees a banner: it is off or has no text.</p>
            )}
          </section>
          <button className="button" type="submit" disabled={Object.keys(changed).length === 0}>
            Save
          </button>
        </form>
      )}
    </section>
  );
}
