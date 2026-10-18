// ============================================================
// File:        keyServer.js
// Path:        client/src/test/keyServer.js
// Project:     Seasonal Entertainment
// Description: Test helper: the /api/keys routes as mockApi answers, with state, behaving like
//              the server (keys/routes.js): creating, replacing and re-sealing the key and
//              setting or removing the recovery seal need the account's current auth key;
//              /check answers 401 for any other. Also makes a key
//              the way a browser would, sealed for a given wrapping key.
// ============================================================

import { newKeyPair, sealBytes } from '@seasonal-entertainment/shared/crypto.js';

const refused = { status: 401, body: { ok: false, message: 'The password is wrong.' } };

// state.authKey: the account's current one (a test may set it later, e.g. from the
// registration request). state.key: what GET /api/keys/me returns.
export function keyServer(authKey, key = null) {
  const state = { authKey, key, nextId: (key?.keyId ?? 0) + 1 };
  const proven = (handler) => (sent) => (sent.authKey === state.authKey ? handler(sent) : refused);
  const store = (sent) => {
    state.key = {
      keyId: state.nextId++,
      publicKey: sent.publicKey,
      sealedPrivateKey: sent.sealedPrivateKey,
      recovery: null,
    };
    return { status: 201, body: { ok: true, keyId: state.key.keyId } };
  };
  return {
    state,
    answers: {
      'GET /keys/me': () => ({ body: { ok: true, key: state.key } }),
      'POST /keys': proven(store),
      'POST /keys/replace': proven(store),
      'PUT /keys/sealed': proven((sent) => {
        state.key = { ...state.key, sealedPrivateKey: sent.sealedPrivateKey };
        return { body: { ok: true } };
      }),
      'PUT /keys/recovery': proven((sent) => {
        state.key = { ...state.key, recovery: { salt: sent.salt, sealed: sent.sealed } };
        return { body: { ok: true } };
      }),
      'DELETE /keys/recovery': proven(() => {
        state.key = { ...state.key, recovery: null };
        return { body: { ok: true } };
      }),
      'POST /keys/check': proven(() => ({ body: { ok: true } })),
    },
  };
}

// A key as a browser makes it: { key (as the server holds it), privateKey }.
export async function browserKey(wrapKey, keyId = 1, recovery = null) {
  const { publicKey, privateKey } = await newKeyPair();
  const sealedPrivateKey = await sealBytes(privateKey, wrapKey);
  return { key: { keyId, publicKey, sealedPrivateKey, recovery }, privateKey };
}
