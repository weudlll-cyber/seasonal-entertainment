// ============================================================
// File:        OutageTestMail.jsx
// Path:        client/src/admin/OutageTestMail.jsx
// Project:     Seasonal Entertainment
// Description: "Send a test e-mail" under Admin → Settings → Alerts (AdminSettingsPage.jsx;
//              docs/DEPLOYMENT.md, "An e-mail when the site is down"; decided 2026-11-14). The
//              e-mails come from the server's own watchdog, not from the site, so a test goes
//              out on its next run (at most 2 minutes): the button asks for one, and the panel
//              says what the watchdog answered, or that it has not yet ("Check again"). Only
//              with a saved address.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { formatWhen } from '../app/dates.js';
import { FormMessage } from '../components/FormField.jsx';

// What the watchdog said about the newest request (test: GET /admin/outage-alert's).
function outcome(test) {
  if (!test?.requestedAt) return null;
  if (!test.result) {
    return `Asked at ${formatWhen(test.requestedAt)}; the watchdog sends it within two minutes.`;
  }
  if (test.result.sent) return `The test e-mail went out at ${formatWhen(test.result.at)}.`;
  return `The test e-mail could not be sent: ${test.result.reason}`;
}

// address: the saved "Outage alert address" ('' while none).
export default function OutageTestMail({ address }) {
  const [test, setTest] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/admin/outage-alert')
        .then((answer) => setTest(answer.test))
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setTest((await api('/admin/outage-alert/test', { method: 'POST' })).test);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="outage-test" aria-label="Test e-mail" role="group">
      <p className="form-field__hint">
        The e-mails come from the server itself, also while the site is down; the mail account is
        set up with the installer (docs/DEPLOYMENT.md).
      </p>
      <p>
        <button
          className="button button--secondary"
          type="button"
          disabled={!address || busy}
          onClick={send}
        >
          Send a test e-mail
        </button>{' '}
        {test?.requestedAt && !test.result && (
          <button className="button button--secondary" type="button" onClick={load}>
            Check again
          </button>
        )}
      </p>
      {!address && <p className="form-field__hint">Save an address first.</p>}
      <FormMessage error={error} notice={outcome(test)} />
    </div>
  );
}
