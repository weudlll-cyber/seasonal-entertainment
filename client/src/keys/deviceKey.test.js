// ============================================================
// File:        deviceKey.test.js
// Path:        client/src/keys/deviceKey.test.js
// Project:     Seasonal Entertainment
// Description: Guards the device copy of the private key (deviceKey.js) over a stand-in
//              IndexedDB (test/memoryIndexedDb.js) and the real Web Crypto: the copy is kept
//              encrypted under a key that cannot be exported, comes back only for its own
//              account, one entry at a time, and is gone after logout; a damaged copy, a
//              browser without IndexedDB or blocked storage leave the device locked, never an
//              error.
// ============================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryIndexedDb } from '../test/memoryIndexedDb.js';
import { clearDeviceKey, loadDeviceKey, saveDeviceKey } from './deviceKey.js';

const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

let idb;
const useIndexedDb = (options) => {
  idb = memoryIndexedDb(options);
  vi.stubGlobal('indexedDB', idb);
};
// What the store holds right now: its one entry, or undefined.
const kept = () => idb.stores('se-keys')?.get('device')?.get('current');

describe('the device copy of the private key', () => {
  beforeEach(() => useIndexedDb());

  it('is kept encrypted under a key that cannot be read out, and comes back', async () => {
    await saveDeviceKey(7, 'key-1', PRIVATE_KEY);
    const entry = kept();
    expect(entry).toMatchObject({ userId: 7, keyId: 'key-1' });
    expect(new Uint8Array(entry.data)).not.toEqual(PRIVATE_KEY);
    expect(entry.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', entry.key)).rejects.toThrow();
    expect(await loadDeviceKey(7)).toEqual({ keyId: 'key-1', privateKey: PRIVATE_KEY });
  });

  it('comes back only for its own account, and nothing kept answers null', async () => {
    expect(await loadDeviceKey(7)).toBeNull();
    await saveDeviceKey(7, 'key-1', PRIVATE_KEY);
    expect(await loadDeviceKey(8)).toBeNull();
  });

  it('holds one entry: a later save replaces the earlier one', async () => {
    await saveDeviceKey(7, 'key-1', PRIVATE_KEY);
    const other = PRIVATE_KEY.map((b) => 255 - b);
    await saveDeviceKey(8, 'key-2', other);
    expect(idb.stores('se-keys').get('device').size).toBe(1);
    expect(await loadDeviceKey(7)).toBeNull();
    expect(await loadDeviceKey(8)).toEqual({ keyId: 'key-2', privateKey: other });
  });

  it('is gone after logout', async () => {
    await saveDeviceKey(7, 'key-1', PRIVATE_KEY);
    await clearDeviceKey();
    expect(kept()).toBeUndefined();
    expect(await loadDeviceKey(7)).toBeNull();
  });

  it('a damaged copy leaves the device locked', async () => {
    await saveDeviceKey(7, 'key-1', PRIVATE_KEY);
    const data = new Uint8Array(kept().data);
    data[0] ^= 0xff; // AES-GCM refuses anything changed
    kept().data = data;
    expect(await loadDeviceKey(7)).toBeNull();
  });
});

describe('without usable storage the device stays locked, never an error', () => {
  it('a browser without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(saveDeviceKey(7, 'key-1', PRIVATE_KEY)).resolves.toBeUndefined();
    expect(await loadDeviceKey(7)).toBeNull();
    await expect(clearDeviceKey()).resolves.toBeUndefined();
  });

  it.each([
    ['opening the database is refused', 'open'],
    ['every request fails', 'request'],
  ])('%s', async (_name, fail) => {
    useIndexedDb({ fail });
    await expect(saveDeviceKey(7, 'key-1', PRIVATE_KEY)).resolves.toBeUndefined();
    expect(kept()).toBeUndefined();
    expect(await loadDeviceKey(7)).toBeNull();
    await expect(clearDeviceKey()).resolves.toBeUndefined();
  });
});
