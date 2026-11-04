// ============================================================
// File:        proxyLogs.test.js
// Path:        server/test/proxyLogs.test.js
// Project:     Seasonal Entertainment
// Description: Guards the Caddy logs of the deployment (deploy/site/Caddyfile, docs/EMBED.md):
//              each log block leaves out every header that carries a token — the embed token
//              (X-Embed-Token, and the chat socket's Sec-WebSocket-Protocol) and a guest's token
//              on another site (X-Embed-Guest, sent by the site and back by the browser).
// ============================================================

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { EMBED_GUEST_HEADER } from '../src/embed/guestTokens.js';

const caddyfile = readFileSync(new URL('../../deploy/site/Caddyfile', import.meta.url), 'utf8');
// Each "format filter { ... }" block: one per log.
const filters = [...caddyfile.matchAll(/format filter \{([^}]*)\}/g)].map((m) => m[1]);

it('the Caddyfile has its two logs, each filtered', () => {
  expect(filters).toHaveLength(2);
});

it.each([
  'request>headers>X-Embed-Token',
  `request>headers>${EMBED_GUEST_HEADER}`,
  'request>headers>Sec-Websocket-Protocol',
])('every log leaves out %s', (field) => {
  for (const filter of filters) expect(filter).toContain(`${field} delete`);
});

it('the access log leaves out the guest token the site sends', () => {
  expect(filters.some((f) => f.includes(`resp_headers>${EMBED_GUEST_HEADER} delete`))).toBe(true);
});
