// ============================================================
// File:        deviceKey.js
// Path:        client/src/keys/deviceKey.js
// Project:     Seasonal Entertainment
// Description: Keeps this device unlocked for private messages across reloads and tabs, until
//              logout: a local copy of the private key, encrypted (AES-GCM) with a Web Crypto
//              key that cannot be exported, both held in IndexedDB. Nothing goes to
//              localStorage. Without IndexedDB (a private window may block it) the device
//              simply stays locked: every function then does nothing or answers null.
// ============================================================

const DB = 'se-keys';
const STORE = 'device';
const ENTRY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// One transaction on the store; resolves with the request's result.
async function run(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const available = () => typeof indexedDB !== 'undefined' && Boolean(globalThis.crypto?.subtle);

export async function saveDeviceKey(userId, keyId, privateKey) {
  if (!available()) return;
  try {
    // extractable: false — the wrapping key itself can never be read out of the browser.
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, privateKey);
    await run('readwrite', (store) => store.put({ userId, keyId, key, iv, data }, ENTRY));
  } catch {
    // Not kept on this device: it asks for the password again next time.
  }
}

// { keyId, privateKey } for this account, or null (nothing kept, another account's, blocked).
export async function loadDeviceKey(userId) {
  if (!available()) return null;
  try {
    const entry = await run('readonly', (store) => store.get(ENTRY));
    if (!entry || entry.userId !== userId) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: entry.iv },
      entry.key,
      entry.data
    );
    return { keyId: entry.keyId, privateKey: new Uint8Array(plain) };
  } catch {
    return null;
  }
}

// Logout: the local copy and the key that encrypted it are both deleted.
export async function clearDeviceKey() {
  if (!available()) return;
  try {
    await run('readwrite', (store) => store.delete(ENTRY));
  } catch {
    // Nothing kept, or storage blocked: nothing to delete.
  }
}
