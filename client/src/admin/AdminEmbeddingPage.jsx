// ============================================================
// File:        AdminEmbeddingPage.jsx
// Path:        client/src/admin/AdminEmbeddingPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin "Embedding" (/admin/embedding): the other sites allowed to show the chat
//              in a frame (owner decision 2026-10-19; docs/EMBED.md). Exact https addresses,
//              checked and normalised by the server; adding and removing are audited.
//              Removing a site ends every login of the chat there at once. Each site has its
//              own rules for guests (SiteRules.jsx), else the "Other sites" settings apply.
// ============================================================

import SiteRules, { RULE_LABELS } from './SiteRules.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

export default function AdminEmbeddingPage() {
  const [origins, setOrigins] = useState(null);
  const [rules, setRules] = useState({}); // { origin: { rule: value } } and the globals
  const [globals, setGlobals] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function shown(data) {
    setOrigins(data.origins);
    setRules(data.rules);
    setGlobals(data.globals);
  }

  useEffect(() => {
    api('/admin/embed-origins')
      .then(shown)
      .catch((err) => setError(err.message));
  }, []);

  async function change(method, origin, done, path = '', extra = {}) {
    setError(null);
    setNotice(null);
    try {
      const data = await api(`/admin/embed-origins${path}`, {
        method,
        body: { origin, ...extra },
      });
      shown(data);
      setNotice(done);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function add(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const origin = new FormData(form).get('origin');
    if (await change('POST', origin, 'Site added.')) form.reset();
  }

  return (
    <section>
      <h2>Embedding</h2>
      <p>
        Sites listed here may show the chat in a frame on their pages. Members log in there in a
        small window on this site; their private messages work there too. This site&apos;s own pages
        never need to be listed.
      </p>
      <form className="form card" onSubmit={add}>
        <FormField
          label="Site address"
          name="origin"
          type="text"
          placeholder="https://game.example.org"
          hint="Exactly one site: https, no path, no wildcards."
          required
        />
        <button className="button" type="submit">
          Add site
        </button>
      </form>
      <FormMessage error={error} notice={notice} />
      {origins && origins.length === 0 && <p>No other site may embed the chat.</p>}
      {origins && origins.length > 0 && (
        <ul aria-label="Sites allowed to embed the chat">
          {origins.map((origin) => (
            <li key={origin} className="card">
              <code>{origin}</code>{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => change('DELETE', origin, `${origin} removed.`)}
              >
                Remove
              </button>
              <SiteRules
                origin={origin}
                rules={rules[origin]}
                globals={globals}
                onChange={(rule, value) =>
                  change('PUT', origin, `${RULE_LABELS[rule]} on ${origin}: ${value}.`, '/rules', {
                    rule,
                    value,
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
