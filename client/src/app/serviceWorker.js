// ============================================================
// File:        serviceWorker.js
// Path:        client/src/app/serviceWorker.js
// Project:     Seasonal Entertainment
// Description: The service worker (/sw.js, from sw.js): registered for every visitor once the page
//              has loaded, so the site can be installed and a member's device can get the
//              "call has started" push (docs/CALLS.md, "Push when a call starts"). It caches
//              nothing. pushRegistration() hands the push switch the ready registration.
// ============================================================

const SW_PATH = '/sw.js';

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window;

// After the load event: the registration never competes with the page's own requests.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_PATH).catch(() => {
      // Without it the site works as before; only installing and push are missing.
    });
  });
}

// The active registration (registering now if the load event has not done it yet).
export async function pushRegistration() {
  await navigator.serviceWorker.register(SW_PATH);
  return navigator.serviceWorker.ready;
}
