// ============================================================
// File:        mockApi.js
// Path:        client/src/test/mockApi.js
// Project:     Seasonal Entertainment
// Description: Test helper: replaces fetch with fixed API answers keyed "METHOD /path"
//              (path without /api). An answer is { status, body } or a function of the sent
//              body returning one (or a promise of one, to hold an answer back); { bytes }
//              answers binary data (a Uint8Array, read with arrayBuffer()); { headers } are the
//              answer's response headers (read with headers.get). Returns the
//              list of calls made ({ key, body, headers }). Unknown calls fail the test.
//              signedIn(user) answers the session and the member's own profile (the account
//              page's Profile section). PRELOGIN answers the login key split's pre-login step
//              with a fixed salt; NO_KEY
//              is a member without a key pair yet; withSettings() adds site settings to a
//              session answer (they travel with it), withFeatures() the server's optional
//              features (features.botAdmin).
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
      calls.push({ key, body: sent, headers: init.headers ?? {} });
      const answer = answers[key];
      if (!answer) throw new Error(`unexpected API call ${key}`);
      const {
        status = 200,
        body = {},
        bytes,
        headers = {},
      } = typeof answer === 'function' ? await answer(sent) : answer;
      return {
        ok: status < 400,
        status,
        headers: { get: (name) => headers[name] ?? null },
        json: async () => body,
        arrayBuffer: async () => bytes.slice().buffer,
      };
    })
  );
  return calls;
}

export const GUEST = { 'GET /auth/session': { body: { ok: true, user: null } } };

export function signedIn(user) {
  const account = { id: 1, email: `${user.username}@example.org`, hasPassword: true, ...user };
  return {
    // hasPassword: every account but one made with Discord has one (docs/AUTH.md).
    'GET /auth/session': { body: { ok: true, user: account } },
    // Their own profile, as the account page's Profile section reads it: nothing added yet.
    [`GET /members/${encodeURIComponent(account.username)}`]: {
      body: { ok: true, profile: { ...account, about: '', picture: null, steps: [], own: true } },
    },
  };
}

// A session answer (GUEST or signedIn(...)) carrying public site settings, e.g.
// { 'chat.uploads': false }; the others keep their defaults.
export const withSettings = (session, settings) => ({
  'GET /auth/session': { body: { ...session['GET /auth/session'].body, settings } },
});

// A session answer carrying the server's optional features, e.g. { botAdmin: true }.
export const withFeatures = (session, features) => ({
  'GET /auth/session': { body: { ...session['GET /auth/session'].body, features } },
});

// The pre-login answer for any username: a fixed salt (docs/AUTH.md, "Login key split").
export const PRELOGIN_SALT = 'AAECAwQFBgcICQoLDA0ODw==';
export const PRELOGIN = {
  'POST /auth/prelogin': { body: { ok: true, salt: PRELOGIN_SALT } },
};

// A member without a key pair yet (keys/): GET /api/keys/me.
export const NO_KEY = { 'GET /keys/me': { body: { ok: true, key: null } } };
