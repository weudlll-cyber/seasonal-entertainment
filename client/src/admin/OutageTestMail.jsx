// ============================================================
// File:        OutageTestMail.jsx
// Path:        client/src/admin/OutageTestMail.jsx
// Project:     Seasonal Entertainment
// Description: "Send a test e-mail" under Admin → Settings → Alerts (AdminSettingsPage.jsx;
//              docs/DEPLOYMENT.md, "An e-mail when the site is down"; decided 2026-11-14). The
//              e-mails come from the server's own watchdog, not from the site, so a test goes
//              out on its next run (at most 2 minutes): the button asks for one, and the panel
//              says what the watchdog answered, or that it has not yet ("Check again"). Only
//              with a saved address. A load that was under way when a send started is ignored,
//              and none starts while a send waits: the send's answer is newer (the panel opening
//              and a quick click raced, 2026-11-17; the click before the first load, 2026-11-23).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Sends started so far, and whether one still waits for its answer. A load answers for the
  // moment it started, so it is used only when no send started since; and none starts while a
  // send waits, since it could answer after the send with the older state (the panel's first
  // load did, when a click came before its effect ran; CI, 2026-11-23).
  const sends = useRef(0);
  const sending = useRef(false);

  const load = useCallback(() => {
    if (sending.current) return; // the send's answer is on its way
    const at = sends.current;
    api('/admin/outage-alert')
      .then((answer) => sends.current === at && setTest(answer.test))
      .catch((err) => sends.current === at && setError(err.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    sends.current += 1;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      setTest((await api('/admin/outage-alert/test', { method: 'POST' })).test);
    } catch (err) {
      setError(err.message);
    }
    sending.current = false;
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
