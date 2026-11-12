// ============================================================
// File:        PushSwitch.jsx
// Path:        client/src/notify/PushSwitch.jsx
// Project:     Seasonal Entertainment
// Description: "When a call starts", in the account page's Notifications section
//              (NotificationSettings.jsx): a web push to this device when a call goes live, also
//              while the site is closed (docs/CALLS.md, "Push when a call starts"; decided
//              2026-11-10). Per device: on here says nothing about the member's other devices.
//              Not shown where the site has no push keys; where the browser cannot receive push,
//              a line says so instead. Members only: the account page is. Turning it on says
//              that it is working (the browser may take a while), and when it does not end
//              "on", the switch stays off and a line under it says why and what to do (decided
//              2026-11-12: never a silent failure). The browser's answer to the permission
//              question also goes to onPermission, so the section shows how to unblock it.
// ============================================================

import { useEffect, useState } from 'react';
import { ApiError } from '../api/http.js';
import { pushSupported } from '../app/serviceWorker.js';
import { FormMessage } from '../components/FormField.jsx';
import { PushFailure, pushIsOn, pushKey, turnPushOff, turnPushOn } from './push.js';
import { permission } from './systemNotify.js';

const SITE_SETTINGS = 'the site settings (the icon left of the address)';
export const PUSH_WORKING = 'Turning on… The first time, the browser can take up to a minute.';
export const PUSH_UNSUPPORTED =
  'When a call starts: this browser cannot receive push notifications, so this is not available here.';
const FAILURES = {
  blocked: `Not turned on: notifications are blocked for this site in your browser. Allow them in ${SITE_SETTINGS}, reload the page and try again.`,
  not_asked: `Not turned on: the browser did not allow notifications (the question was closed or not shown). Allow them in ${SITE_SETTINGS} and try again.`,
  timeout:
    "Not turned on: your browser's push service did not answer in time. Please try again later.",
};

// The words for a failed "on": the browser's step, the server's refusal, or anything else.
export function pushFailureText(err) {
  if (err instanceof PushFailure && FAILURES[err.kind]) return FAILURES[err.kind];
  if (err instanceof PushFailure) {
    const detail = err.cause?.message ? ` (${err.cause.message})` : '';
    return `Not turned on: your browser could not set up push${detail}. Please try again later.`;
  }
  if (err instanceof ApiError) return `Not turned on: the site refused it. ${err.message}`;
  return `Not turned on: ${err?.message || 'something went wrong'}. Please try again.`;
}

// run, busy: the section's (one change at a time, its error line).
export default function PushSwitch({ run, busy, onPermission }) {
  const [key, setKey] = useState(null);
  const [on, setOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = await pushKey();
      if (!alive || !found) return;
      setKey(found);
      if (!pushSupported()) return;
      const state = await pushIsOn(found);
      if (alive) setOn(state);
    })().catch(() => {
      // Push stays hidden; every other switch on the page works as before.
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!key) return null;
  if (!pushSupported()) return <p className="form-field__hint">{PUSH_UNSUPPORTED}</p>;

  const change = (event) => {
    const wanted = event.target.checked;
    setFailure(null);
    return run(async () => {
      if (!wanted) {
        await turnPushOff();
        setOn(false);
        return;
      }
      setWorking(true);
      try {
        await turnPushOn(key);
        setOn(true);
      } catch (err) {
        setOn(false);
        setFailure(pushFailureText(err));
      } finally {
        setWorking(false);
        onPermission(permission());
      }
    });
  };

  return (
    <>
      <label className="form-check">
        <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={change} />
        <span>When a call starts (on this device, also while the site is closed)</span>
      </label>
      <FormMessage error={failure} notice={working ? PUSH_WORKING : null} />
    </>
  );
}
