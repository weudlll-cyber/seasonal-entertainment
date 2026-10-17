// ============================================================
// File:        mockApi.js
// Path:        client/src/test/mockApi.js
// Project:     Seasonal Entertainment
// Description: Test helper: replaces fetch with fixed API answers keyed "METHOD /path"
//              (path without /api). An answer is { status, body } or a function of the sent
//              body returning one. Returns the list of calls made. Unknown calls fail the test.
// ============================================================

import { vi } from 'vitest';

export function mockApi(answers) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url.replace(/^\/api/, '')}`;
      const sent = init.body ? JSON.parse(init.body) : undefined;
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
