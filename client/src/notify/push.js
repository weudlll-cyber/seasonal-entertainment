// ============================================================
// File:        push.js
// Path:        client/src/notify/push.js
// Project:     Seasonal Entertainment
// Description: The steps behind the "When a call starts" switch (docs/CALLS.md, "Push when a
//              call starts"; decided 2026-11-10): the site's public key (null: push is off
//              here), whether this device is on for this account (the server decides: a
//              browser's subscription may still belong to another account that used it), and
//              turning it on (the browser's permission, a subscription made for the site's key,
//              handed to the server) or off (removed on both sides).
// ============================================================

import { api } from '../api/http.js';
import { pushRegistration } from '../app/serviceWorker.js';
import { askPermission } from './systemNotify.js';

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

// Returns the browser's answer to the permission question ('granted' when it is on now).
export async function turnPushOn(key) {
  const answer = await askPermission();
  if (answer !== 'granted') return answer;
  const { registration, sub } = await currentSubscription();
  let current = sub;
  if (current && !madeFor(current, key)) {
    await current.unsubscribe();
    current = null;
  }
  current ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
  const { endpoint, keys } = current.toJSON();
  await api('/push/subscriptions', { method: 'POST', body: { endpoint, keys } });
  return answer;
}

export async function turnPushOff() {
  const { sub } = await currentSubscription();
  if (!sub) return;
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
