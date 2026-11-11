// ============================================================
// File:        PushSwitch.jsx
// Path:        client/src/notify/PushSwitch.jsx
// Project:     Seasonal Entertainment
// Description: "When a call starts", in the account page's Notifications section
//              (NotificationSettings.jsx): a web push to this device when a call goes live, also
//              while the site is closed (docs/CALLS.md, "Push when a call starts"; decided
//              2026-11-10). Per device: on here says nothing about the member's other devices.
//              Not shown where the browser cannot receive push or the site has no push keys.
//              Members only: the account page is. The browser's answer to the permission
//              question goes to onPermission, so the section shows how to unblock it.
// ============================================================

import { useEffect, useState } from 'react';
import { pushSupported } from '../app/serviceWorker.js';
import { pushIsOn, pushKey, turnPushOff, turnPushOn } from './push.js';

// run, busy: the section's (one change at a time, its error line).
export default function PushSwitch({ run, busy, onPermission }) {
  const [key, setKey] = useState(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return undefined;
    let alive = true;
    (async () => {
      const found = await pushKey();
      if (!alive || !found) return;
      setKey(found);
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

  const change = (event) => {
    const wanted = event.target.checked;
    return run(async () => {
      if (!wanted) {
        await turnPushOff();
        setOn(false);
        return;
      }
      const answer = await turnPushOn(key);
      onPermission(answer);
      setOn(answer === 'granted');
    });
  };

  return (
    <label className="form-check">
      <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={change} />
      <span>When a call starts (on this device, also while the site is closed)</span>
    </label>
  );
}
