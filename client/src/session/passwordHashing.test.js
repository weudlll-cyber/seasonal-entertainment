// ============================================================
// File:        passwordHashing.test.js
// Path:        client/src/session/passwordHashing.test.js
// Project:     Seasonal Entertainment
// Description: The password-hashing worker gives exactly the main-thread results of
//              shared/crypto.js for fixed inputs; the page's side sends every derivation to
//              the worker (one worker, reused) and falls back to the main thread when there is
//              no Worker or it fails to load. The worker runs here in-process: a stand-in
//              Worker hands each message to the worker module's handle() and copies the answer
//              the way postMessage does (structuredClone).
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shared from '@seasonal-entertainment/shared/crypto.js';
import { handle } from './passwordHashing.worker.js';

const SALT = 'AAECAwQFBgcICQoLDA0ODw=='; // 16 fixed bytes
const PASSWORD = 'correct-horse-1';
const CODE = 'ABCDE-FGHJK-MNPQR-STUVW-XYZ23-45678';
const BAD_SALT = '%'; // not base64: libsodium throws
// What crossed postMessage is a copy (another realm's Uint8Array here): compare the bytes.
const bytes = (view) => [...view];
const plainKeys = ({ authKey, wrapKey }) => ({ authKey, wrapKey: bytes(wrapKey) });
const mainError = async () =>
  (await shared.deriveAccountKeys(PASSWORD, BAD_SALT).catch((error) => error)).message;

describe('the worker module', () => {
  it('derives exactly what the main thread derives', async () => {
    const main = await shared.deriveAccountKeys(PASSWORD, SALT);
    expect(await handle({ id: 1, op: 'deriveAccountKeys', args: [PASSWORD, SALT] })).toEqual({
      id: 1,
      result: main,
    });
    const recovery = await handle({ id: 2, op: 'deriveRecoveryKey', args: [CODE, SALT] });
    expect(recovery.result).toEqual(await shared.deriveRecoveryKey(CODE, SALT));
  });

  it('answers an error for anything else, never runs it', async () => {
    expect(await handle({ id: 3, op: 'newKeyPair', args: [] })).toEqual({
      id: 3,
      error: 'Unknown operation newKeyPair.',
    });
    const bad = await handle({ id: 4, op: 'deriveAccountKeys', args: [PASSWORD, BAD_SALT] });
    expect(bad).toEqual({ id: 4, error: await mainError() });
  });
});

// A stand-in Worker running the worker module in this process; failing: it never loads.
function stubWorker({ failing = false } = {}) {
  const made = [];
  class FakeWorker {
    constructor(url, options) {
      this.url = String(url);
      this.options = options;
      this.posted = [];
      made.push(this);
    }

    postMessage(message) {
      this.posted.push(message.op);
      setTimeout(async () => {
        if (failing) return this.onerror?.(new Event('error'));
        this.onmessage?.({ data: structuredClone(await handle(structuredClone(message))) });
      });
    }

    terminate() {}
  }
  vi.stubGlobal('Worker', FakeWorker);
  return made;
}

describe("the page's side", () => {
  // A fresh module per test: it keeps its worker for the page's lifetime.
  let hashing;
  beforeEach(async () => {
    vi.resetModules();
    hashing = await import('./passwordHashing.js');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends every derivation to one module worker of its own file', async () => {
    const made = stubWorker();
    const keys = await hashing.deriveAccountKeys(PASSWORD, SALT);
    expect(plainKeys(keys)).toEqual(plainKeys(await shared.deriveAccountKeys(PASSWORD, SALT)));
    expect(ArrayBuffer.isView(keys.wrapKey)).toBe(true);
    expect(bytes(await hashing.deriveRecoveryKey(CODE, SALT))).toEqual(
      bytes(await shared.deriveRecoveryKey(CODE, SALT))
    );
    expect(made).toHaveLength(1);
    // Its own file on this origin: nothing inline, nothing the CSP would have to allow.
    const url = new URL(made[0].url);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/src/session/passwordHashing.worker.js');
    expect(made[0].options).toEqual({ type: 'module' });
    expect(made[0].posted).toEqual(['deriveAccountKeys', 'deriveRecoveryKey']);
  });

  it("rejects with the worker's error", async () => {
    stubWorker();
    await expect(hashing.deriveAccountKeys(PASSWORD, BAD_SALT)).rejects.toThrow(await mainError());
  });

  it('falls back to the main thread when the worker cannot load, and stays there', async () => {
    const made = stubWorker({ failing: true });
    const expected = await shared.deriveAccountKeys(PASSWORD, SALT);
    expect(await hashing.deriveAccountKeys(PASSWORD, SALT)).toEqual(expected);
    expect(await hashing.deriveAccountKeys(PASSWORD, SALT)).toEqual(expected);
    expect(made).toHaveLength(1); // not started again
    expect(made[0].posted).toEqual(['deriveAccountKeys']);
  });

  it('runs on the main thread where there is no Worker', async () => {
    vi.stubGlobal('Worker', undefined);
    expect(await hashing.deriveAccountKeys(PASSWORD, SALT)).toEqual(
      await shared.deriveAccountKeys(PASSWORD, SALT)
    );
  });
});
