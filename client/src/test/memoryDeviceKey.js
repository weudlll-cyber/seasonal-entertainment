// ============================================================
// File:        memoryDeviceKey.js
// Path:        client/src/test/memoryDeviceKey.js
// Project:     Seasonal Entertainment
// Description: Test stand-in for keys/deviceKey.js (jsdom has no IndexedDB): the same three
//              functions over one in-memory entry, plus deviceEntry() and resetDevice() for the
//              test. Used as vi.mock('../keys/deviceKey.js', () => import(this file)).
// ============================================================

let entry = null;

export const deviceEntry = () => entry;

export function resetDevice(value = null) {
  entry = value;
}

export async function saveDeviceKey(userId, keyId, privateKey) {
  entry = { userId, keyId, privateKey };
}

export async function loadDeviceKey(userId) {
  return entry?.userId === userId ? { keyId: entry.keyId, privateKey: entry.privateKey } : null;
}

export async function clearDeviceKey() {
  entry = null;
}
