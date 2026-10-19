// ============================================================
// File:        passwordHashing.worker.js
// Path:        client/src/session/passwordHashing.worker.js
// Project:     Seasonal Entertainment
// Description: Web Worker for the slow part of every password form: Argon2id (about 64 MiB,
//              most of a second) runs here, off the page's main thread, so the page keeps
//              responding. It runs the very functions of shared/crypto.js, nothing of its own;
//              passwordHashing.js is the page's side. A same-origin module file, no inline
//              worker, so the site's CSP needs no change (docs/AUTH.md).
// ============================================================

/* global WorkerGlobalScope */ // defined inside workers only
import { deriveAccountKeys, deriveRecoveryKey } from '@seasonal-entertainment/shared/crypto.js';

const OPERATIONS = { deriveAccountKeys, deriveRecoveryKey };

// One request { id, op, args } -> { id, result } or { id, error }. Exported for the tests,
// which run it without a worker.
export async function handle({ id, op, args }) {
  try {
    if (!Object.hasOwn(OPERATIONS, op)) throw new Error(`Unknown operation ${op}.`);
    return { id, result: await OPERATIONS[op](...args) };
  } catch (error) {
    return { id, error: error.message };
  }
}

// Only inside a worker; imported anywhere else (tests), the module just exports handle.
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async (event) => globalThis.postMessage(await handle(event.data));
}
