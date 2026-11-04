// ============================================================
// File:        proxyLogs.test.js
// Path:        server/test/proxyLogs.test.js
// Project:     Seasonal Entertainment
// Description: Guards the Caddy logs of the deployment (deploy/site/Caddyfile, docs/EMBED.md):
//              each log block leaves out every header that carries a token — the embed token
//              (X-Embed-Token, and the chat socket's Sec-WebSocket-Protocol) and a guest's token
//              on another site (X-Embed-Guest, sent by the site and back by the browser); and the
//              two queries with secrets (Discord's callback, a file link's ?link=) are cut from
//              the logged address, every other address kept whole (the rule tried here as Caddy
//              applies it: Go's regexp, ${1} the first group).
// ============================================================

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { EMBED_GUEST_HEADER } from '../src/embed/guestTokens.js';

const caddyfile = readFileSync(new URL('../../deploy/site/Caddyfile', import.meta.url), 'utf8');
// Each "format filter { ... }" block: one per log, up to the line holding only its "}" (a rule's
// value may hold braces itself, such as ${1}).
const filters = [...caddyfile.matchAll(/format filter \{([\s\S]*?)\n\s*\}\n/g)].map((m) => m[1]);

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

// The request>uri rule of a filter block: [pattern, replacement], or undefined.
const uriRule = (filter) => {
  const m = /request>uri regexp "([^"]+)" "([^"]+)"/.exec(filter);
  return m && [m[1], m[2]];
};

it.each([
  ['/api/auth/discord/callback?code=c0de&state=st4te', '/api/auth/discord/callback'],
  ['/api/chat/files/12/thumb?link=1.2.s1gn', '/api/chat/files/12/thumb'],
  ['/chat?room=general', '/chat?room=general'],
  ['/api/chat/rooms/general/messages?after=4', '/api/chat/rooms/general/messages?after=4'],
])('every log writes %s as %s', (uri, logged) => {
  for (const filter of filters) {
    const rule = uriRule(filter);
    expect(rule).toBeTruthy();
    const [pattern, replacement] = rule;
    // Caddyfile strings keep the backslash; ${1} is Go's $1.
    expect(uri.replace(new RegExp(pattern), replacement.replace('${1}', '$1'))).toBe(logged);
  }
});

it('the access log leaves out the guest token the site sends', () => {
  expect(filters.some((f) => f.includes(`resp_headers>${EMBED_GUEST_HEADER} delete`))).toBe(true);
});
