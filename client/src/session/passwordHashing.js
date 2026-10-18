// ============================================================
// File:        passwordHashing.js
// Path:        client/src/session/passwordHashing.js
// Project:     Seasonal Entertainment
// Description: The page's side of the password-hashing worker (passwordHashing.worker.js):
//              deriveAccountKeys and deriveRecoveryKey with the same arguments and results as
//              shared/crypto.js, computed in the worker so login, registration, password
//              change, unlock and recovery no longer freeze the page. One worker per page,
//              started at the first use. Where there is no Worker (tests, very old browsers)
//              or it fails to start, the same functions run on the main thread instead.
// ============================================================

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

let worker = null;
let workerBroken = false;
let nextId = 0;
const waiting = new Map(); // request id -> { op, args, resolve, reject }

async function onMainThread(op, args) {
  return (await crypto())[op](...args);
}

function startWorker() {
  // new URL(..., import.meta.url): Vite builds the worker as its own same-origin file.
  const started = new Worker(new URL('./passwordHashing.worker.js', import.meta.url), {
    type: 'module',
  });
  started.onmessage = ({ data }) => {
    const request = waiting.get(data.id);
    waiting.delete(data.id);
    if ('error' in data) request.reject(new Error(data.error));
    else request.resolve(data.result);
  };
  // The worker could not load or crashed: what it still owes is computed here instead.
  started.onerror = () => {
    workerBroken = true;
    worker = null;
    started.terminate();
    for (const { op, args, resolve, reject } of waiting.values()) {
      onMainThread(op, args).then(resolve, reject);
    }
    waiting.clear();
  };
  return started;
}

function run(op, args) {
  if (workerBroken || typeof Worker === 'undefined') return onMainThread(op, args);
  worker ??= startWorker();
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { op, args, resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

// { authKey (base64), wrapKey (bytes) }, as shared/crypto.js's deriveAccountKeys.
export const deriveAccountKeys = (password, saltBase64) =>
  run('deriveAccountKeys', [password, saltBase64]);

// The recovery code's key (bytes), as shared/crypto.js's deriveRecoveryKey.
export const deriveRecoveryKey = (code, saltBase64) => run('deriveRecoveryKey', [code, saltBase64]);
