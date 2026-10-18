// ============================================================
// File:        mockApi.js
// Path:        client/src/test/mockApi.js
// Project:     Seasonal Entertainment
// Description: Test helper: replaces fetch with fixed API answers keyed "METHOD /path"
//              (path without /api). An answer is { status, body } or a function of the sent
//              body returning one. Returns the list of calls made. Unknown calls fail the test.
//              PRELOGIN answers the login key split's pre-login step with a fixed salt; NO_KEY
//              is a member without a key pair yet.
// ============================================================

import { vi } from 'vitest';

export function mockApi(answers) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url.replace(/^\/api/, '')}`;
      // JSON bodies are parsed; a file (upload) is passed through as it is.
      const sent = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ key, body: sent });
      const answer = answers[key];
      if (!answer) throw new Error(`unexpected API call ${key}`);
      const { status = 200, body = {} } = typeof answer === 'function' ? answer(sent) : answer;
      return { ok: status < 400, status, json: async () => body };
    })
  );
  return calls;
}

export const GUEST = { 'GET /auth/session': { body: { ok: true, user: null } } };

export function signedIn(user) {
  return {
    'GET /auth/session': {
      body: { ok: true, user: { id: 1, email: `${user.username}@example.org`, ...user } },
    },
  };
}

// The pre-login answer for any username: a fixed salt (docs/AUTH.md, "Login key split").
export const PRELOGIN_SALT = 'AAECAwQFBgcICQoLDA0ODw==';
export const PRELOGIN = {
  'POST /auth/prelogin': { body: { ok: true, salt: PRELOGIN_SALT, legacy: false } },
};

// A member without a key pair yet (keys/): GET /api/keys/me.
export const NO_KEY = { 'GET /keys/me': { body: { ok: true, key: null } } };
