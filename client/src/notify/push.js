// ============================================================
// File:        push.js
// Path:        client/src/notify/push.js
// Project:     Seasonal Entertainment
// Description: The steps behind the "When a call starts" switch (docs/CALLS.md, "Push when a
//              call starts"; decided 2026-11-10): the site's public key (null: push is off
//              here), whether this device is on for this account (the server decides: a
//              browser's subscription may still belong to another account that used it), and
//              turning it on (the browser's permission, a subscription made for the site's key,
//              handed to the server) or off (removed on both sides). Turning on either works or
//              throws: a PushFailure says which step of the browser's failed (blocked, not
//              asked, no answer within SUBSCRIBE_MS, or refused), an ApiError that the server
//              refused; PushSwitch.jsx says it in words (seen 2026-11-12: the browser's push
//              service took 32 s on a fresh Chrome profile, and the switch said nothing).
// ============================================================

import { api } from '../api/http.js';
import { pushRegistration } from '../app/serviceWorker.js';
import { askPermission } from './systemNotify.js';

// How long the browser may take to register with its push service: the first time on a
// fresh Chrome profile took 32 s (2026-11-12), so well above that, but never forever.
export const SUBSCRIBE_MS = 90_000;

// kind: 'blocked' (permission denied), 'not_asked' (the question was closed or never shown),
// 'timeout' (no answer within SUBSCRIBE_MS) or 'refused' (the browser's own error, as cause).
export class PushFailure extends Error {
  constructor(kind, cause = undefined) {
    super(kind, { cause });
    this.kind = kind;
  }
}

// The public key as the browser wants it: base64url to bytes.
function keyBytes(key) {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// A subscription made for another key (the site's keys changed) cannot receive anything.
function madeFor(sub, key) {
  const used = sub.options?.applicationServerKey;
  if (!used) return false;
  const a = new Uint8Array(used);
  const b = keyBytes(key);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export async function pushKey() {
  return (await api('/push')).publicKey;
}

async function currentSubscription() {
  const registration = await pushRegistration();
  return { registration, sub: await registration.pushManager.getSubscription() };
}

export async function pushIsOn(key) {
  const { sub } = await currentSubscription();
  if (!sub || !madeFor(sub, key)) return false;
  const answer = await api('/push/status', { method: 'POST', body: { endpoint: sub.endpoint } });
  return answer.subscribed;
}

// The browser's part: a subscription for the site's key, made now unless it has one.
async function browserSubscription(key) {
  const { registration, sub } = await currentSubscription();
  if (sub && madeFor(sub, key)) return sub;
  if (sub) await sub.unsubscribe();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
}

// Resolves once the server has the subscription; otherwise throws (see the header).
export async function turnPushOn(key) {
  const answer = await askPermission();
  if (answer === 'denied') throw new PushFailure('blocked');
  if (answer !== 'granted') throw new PushFailure('not_asked');
  let timer;
  const late = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new PushFailure('timeout')), SUBSCRIBE_MS);
  });
  let sub;
  try {
    sub = await Promise.race([browserSubscription(key), late]);
  } catch (err) {
    throw err instanceof PushFailure ? err : new PushFailure('refused', err);
  } finally {
    clearTimeout(timer);
  }
  const { endpoint, keys } = sub.toJSON();
  await api('/push/subscriptions', { method: 'POST', body: { endpoint, keys } });
}

export async function turnPushOff() {
  const { sub } = await currentSubscription();
  if (!sub) return;
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
