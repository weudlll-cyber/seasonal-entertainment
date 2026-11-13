// ============================================================
// File:        PushSwitch.jsx
// Path:        client/src/notify/PushSwitch.jsx
// Project:     Seasonal Entertainment
// Description: "When a call starts", in the account page's Notifications section
//              (NotificationSettings.jsx): a web push to this device when a call goes live, also
//              while the site is closed (docs/CALLS.md, "Push when a call starts"; decided
//              2026-11-10). Per device: on here says nothing about the member's other devices.
//              Not shown where the site has no push keys; where the browser cannot receive push,
//              a line says so instead. Members only: the account page is. Turning it on shows it
//              on at once; the rest finishes in the background (pushPending.js; decided
//              2026-11-13), with "Finishing in the background…" under it meanwhile, and the rest
//              of the page usable. Only a final failure turns it back off, with a line saying
//              why and what to do (pushFailure.js; never a silent failure, decided 2026-11-12).
//              The permission's answer also goes to onPermission, so the section shows how to
//              unblock it.
// ============================================================

import { useEffect, useState } from 'react';
import { pushSupported } from '../app/serviceWorker.js';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import { pushIsOn, pushKey, turnPushOff } from './push.js';
import { clearPushFailure, startPushOn, usePushProgress } from './pushPending.js';
import { permission } from './systemNotify.js';

export const PUSH_FINISHING = 'Finishing in the background…';
export const PUSH_UNSUPPORTED =
  'When a call starts: this browser cannot receive push notifications, so this is not available here.';

// run, busy: the section's (one change at a time, its error line), for turning it off.
export default function PushSwitch({ run, busy, onPermission }) {
  const { user } = useSession();
  const [key, setKey] = useState(null);
  const [on, setOn] = useState(false);
  const { finishing, failure } = usePushProgress(user.id);
  // A turn-on that ends while this page shows (started here or resumed after a reload): on
  // unless it failed.
  const [wasFinishing, setWasFinishing] = useState(finishing);
  if (wasFinishing !== finishing) {
    setWasFinishing(finishing);
    if (!finishing) setOn(!failure);
  }

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
    if (!event.target.checked) {
      clearPushFailure();
      return run(async () => {
        await turnPushOff();
        setOn(false);
      });
    }
    // On at once (finishing); how it ends comes back through usePushProgress.
    return startPushOn(user.id, key).then(() => onPermission(permission()));
  };

  return (
    <>
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          checked={finishing || on}
          disabled={busy || finishing}
          onChange={change}
        />
        <span>When a call starts (on this device, also while the site is closed)</span>
      </label>
      {finishing && (
        <p className="form-field__hint" role="status">
          {PUSH_FINISHING}
        </p>
      )}
      <FormMessage error={finishing ? null : failure} />
    </>
  );
}
