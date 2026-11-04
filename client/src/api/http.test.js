// ============================================================
// File:        http.test.js
// Path:        client/src/api/http.test.js
// Project:     Seasonal Entertainment
// Description: What a failed API call says (api/http.js): no connection, or a reply the site did
//              not write (a proxy's 502 page, a 503/504 without the site's message), says
//              NO_ANSWER; every message the server sends is kept as it is. fetch is replaced by a
//              stand-in answering raw replies (mockApi.js always answers JSON).
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, NO_ANSWER } from './http.js';

afterEach(() => vi.unstubAllGlobals());

// A raw reply: body is a string, read with json() as a server would send it.
const reply = (status, body) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => JSON.parse(body),
    }))
  );

const failure = (path = '/thing') => api(path).catch((err) => err);

describe('a call that fails', () => {
  it('without a connection says the server did not answer', async () => {
    const cause = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    const err = await failure();
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'no_answer', message: NO_ANSWER, cause });
  });

  it("with a proxy's 502 page, not JSON, says the server did not answer", async () => {
    reply(502, '<html><body>502 Bad Gateway</body></html>');
    expect(await failure()).toMatchObject({ status: 502, code: 'no_answer', message: NO_ANSWER });
  });

  it('with a 503 or 504 in JSON but no message says the server did not answer', async () => {
    for (const status of [503, 504]) {
      reply(status, '{"ok":false}');
      expect(await failure()).toMatchObject({ status, message: NO_ANSWER });
    }
  });

  it("with the server's own JSON error keeps its code and message", async () => {
    reply(400, '{"ok":false,"error":"name_taken","message":"That name is taken.","field":"name"}');
    const err = await failure();
    expect(err).toMatchObject({ status: 400, code: 'name_taken', message: 'That name is taken.' });
    expect(err.details.field).toBe('name');
  });

  it("with the server's message on a 503 keeps that message", async () => {
    reply(503, '{"ok":false,"error":"calls_off","message":"Calls are not set up."}');
    expect(await failure()).toMatchObject({ code: 'calls_off', message: 'Calls are not set up.' });
  });

  it('with JSON from the site but no message says "Request failed."', async () => {
    reply(500, '{"ok":false}');
    expect(await failure()).toMatchObject({ code: 'error', message: 'Request failed.' });
  });
});
