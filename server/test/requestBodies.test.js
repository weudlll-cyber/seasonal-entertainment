// ============================================================
// File:        requestBodies.test.js
// Path:        server/test/requestBodies.test.js
// Project:     Seasonal Entertainment
// Description: Guards the request body parsers (src/http/bodies.js): a compressed body is
//              refused with 415 before anything is inflated, on a JSON route and on a raw file
//              route alike; the same body uncompressed is read as usual.
// ============================================================

import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const JSON_BODY = JSON.stringify({ username: 'anna' });

describe('a compressed request body', () => {
  it('is refused on a JSON route; uncompressed it is read', async () => {
    t = makeTestApp();
    const send = (body, encoding) => {
      const req = t.client().post('/api/auth/prelogin').set('Content-Type', 'application/json');
      return (encoding ? req.set('Content-Encoding', encoding) : req).send(body);
    };
    const refused = await send(gzipSync(JSON_BODY), 'gzip');
    expect(refused.status).toBe(415);
    expect(refused.body.error).toBe('unsupported_encoding');
    expect((await send(JSON_BODY)).status).toBe(200);
  });

  it('is refused on a file upload route', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna');
    const res = await agent
      .post('/api/chat/uploads?room=general')
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Encoding', 'gzip')
      .send(gzipSync(Buffer.alloc(1024)));
    expect(res.status).toBe(415);
  });
});
