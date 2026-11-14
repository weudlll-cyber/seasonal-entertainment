// ============================================================
// File:        pushPending.js
// Path:        client/src/notify/pushPending.js
// Project:     Seasonal Entertainment
// Description: Turning "When a call starts" on without the member waiting (decided 2026-11-13):
//              the switch shows on at once, and the browser's registration and the server
//              request (push.js, turnPushOn: 90 s at most) run here in the background, beyond
//              the account page: going to another page of the site keeps them running (module
//              state), and a page that is closed or reloaded meanwhile leaves a marker in this
//              browser's storage, so the next page load of the site finishes it
//              (useResumePush, in Layout). A failure is kept for the account page, which then
//              shows the switch off with its reason (pushFailure.js). Chrome's push service
//              took 23-62 s for a first registration on the owner's PC (2026-11-13, its own
//              retries), about 2 s once it was ready. Logging out (pushOffForLogout, decided
//              2026-11-13) turns this device's push off on both sides and drops the marker; a
//              turn-on still running hands the server its subscription only while its own
//              account is still the one signed in, so it never finishes under the next one.
// ============================================================

import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../app/storage.js';
import { pushSupported } from '../app/serviceWorker.js';
import { api } from '../api/http.js';
import { pushKey, turnPushOff, turnPushOn } from './push.js';
import { pushFailureText } from './pushFailure.js';

// { userId, at }: a turn-on started and not finished yet. { userId, text }: how the last one failed.
export const PENDING_KEY = 'se.pushPending';
const FAILED_KEY = 'se.pushFailed';

const listeners = new Set();
let job = null; // the turn-on running in this page: { userId, promise }
// The longest a logout waits for this device's push to go off (the browser may be slow).
const LOGOUT_WAIT_MS = 3000;

function readJson(key) {
  try {
    return JSON.parse(readStored(key) ?? 'null');
  } catch {
    return null;
  }
}
const changed = () => {
  for (const listener of listeners) listener();
};

// key: the site's public key, when the switch has it (then the permission question is asked
// within the member's click, as browsers require).
function begin(userId, key) {
  writeStored(PENDING_KEY, JSON.stringify({ userId, at: Date.now() }));
  writeStored(FAILED_KEY, null);
  // Still this account in this browser (not logged out, nobody else signed in meanwhile).
  const stillWanted = async () => (await api('/auth/session')).user?.id === userId;
  const promise = (async () => {
    try {
      await turnPushOn(key ?? (await pushKey()), stillWanted);
    } catch (err) {
      // Called off by a logout: nothing failed, nothing to tell.
      if (err.kind !== 'called_off') {
        writeStored(FAILED_KEY, JSON.stringify({ userId, text: pushFailureText(err) }));
      }
    } finally {
      writeStored(PENDING_KEY, null);
      job = null;
      changed();
    }
  })();
  job = { userId, promise };
  changed();
  return promise;
}

// The switch was turned on: resolves when it has finished, either way (pushProgress tells how).
export const startPushOn = (userId, key) => begin(userId, key);

// Before the logout itself, while the session still allows the server's part: this device's
// push off on both sides, a turn-on left by a closed page forgotten. Never throws, and never
// holds the logout up for more than LOGOUT_WAIT_MS.
export async function pushOffForLogout() {
  writeStored(PENDING_KEY, null);
  changed();
  if (!pushSupported()) return;
  await Promise.race([
    turnPushOff().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
  ]);
}

// For this account: still finishing, and the last failure's words (null: none).
export function pushProgress(userId) {
  const failed = readJson(FAILED_KEY);
  return {
    finishing: job?.userId === userId || (!job && readJson(PENDING_KEY)?.userId === userId),
    failure: failed?.userId === userId ? failed.text : null,
  };
}

// Turned off, or tried again: the old reason no longer applies.
export function clearPushFailure() {
  writeStored(FAILED_KEY, null);
  changed();
}

export function usePushProgress(userId) {
  const [progress, setProgress] = useState(() => pushProgress(userId));
  useEffect(() => {
    const update = () => setProgress(pushProgress(userId));
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }, [userId]);
  return progress;
}

// Every page load of a signed-in member: a turn-on left unfinished by a closed or reloaded page
// is finished now (the permission was given then; the browser may even have the subscription).
export function useResumePush(user) {
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId === null || job || !pushSupported()) return;
    if (readJson(PENDING_KEY)?.userId === userId) begin(userId, null);
  }, [userId]);
}
