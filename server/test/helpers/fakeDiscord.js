// ============================================================
// File:        fakeDiscord.js
// Path:        server/test/helpers/fakeDiscord.js
// Project:     Seasonal Entertainment
// Description: Test helper: a pretend Discord for the server's Discord login and role reads
//              (discord/api.js), behaving as the probe of 2026-11-02 found the real one
//              (reports/DISCORD-PROBE-2026-11-02.md): authorization codes bound to their PKCE
//              challenge and redirect, the client secret checked, refresh tokens that rotate (the
//              old one answers invalid_grant at once), revocation, the member record with its
//              role ids, and 404 code 10004 for someone not on the server. fetch is what the app
//              gets as discordFetch; approve() plays the member clicking "Authorize".
// ============================================================

import { createHash, randomBytes } from 'node:crypto';

export const DISCORD_TEST = {
  clientId: '100000000000000001',
  clientSecret: 'the-client-secret-never-shown',
  guildId: '902220302199689266',
  redirectUri: 'http://se.test/api/auth/discord/callback',
  apiBase: 'https://discord.test/api/v10',
  authorizeUrl: 'https://discord.test/oauth2/authorize',
  scopes: 'identify guilds.members.read',
  timeoutMs: 2000,
};

const token = (prefix) => `${prefix}-${randomBytes(12).toString('hex')}`;
const json = (status, body) => new Response(JSON.stringify(body), { status });

export function fakeDiscord() {
  const users = new Map(); // discord id -> { id, username, roles | null (not on the server) }
  const codes = new Map(); // code -> { userId, challenge, redirectUri }
  const access = new Map(); // access token -> discord id
  const refresh = new Map(); // refresh token -> discord id (live ones only)
  const fake = {
    calls: { refresh: 0, member: 0, revoke: 0 },
    revoked: [],
    // Every body and header the site sent to Discord, to check what travels where.
    sent: [],
    // When set, the next refresh waits for this promise first (parallel refresh tests).
    refreshGate: null,
    // When set (seconds), the next token call answers 429 with this retry_after.
    rateLimitNext: null,
    addUser(id, username, roles = []) {
      users.set(id, { id, username, roles });
    },
    setRoles(id, roles) {
      users.get(id).roles = roles;
    },
    leaveServer(id) {
      users.get(id).roles = null;
    },
    liveRefreshTokens: () => [...refresh.keys()],
    // The member clicks "Authorize" on the page the site sent them to: returns the site's
    // callback path with the code and the state.
    approve(location, discordId) {
      const url = new URL(location);
      const code = token('code');
      codes.set(code, {
        userId: discordId,
        challenge: url.searchParams.get('code_challenge'),
        redirectUri: url.searchParams.get('redirect_uri'),
      });
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.search = new URLSearchParams({ code, state: url.searchParams.get('state') }).toString();
      return `${back.pathname}${back.search}`;
    },
    deny(location) {
      const url = new URL(location);
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.search = new URLSearchParams({
        error: 'access_denied',
        state: url.searchParams.get('state'),
      }).toString();
      return `${back.pathname}${back.search}`;
    },
    async fetch(url, init = {}) {
      const path = new URL(url).pathname.replace('/api/v10', '');
      const headers = init.headers ?? {};
      fake.sent.push({ path, body: String(init.body ?? ''), auth: headers.Authorization ?? '' });
      if (path === '/oauth2/token' || path === '/oauth2/token/revoke') {
        const expected = `Basic ${Buffer.from(`${DISCORD_TEST.clientId}:${DISCORD_TEST.clientSecret}`).toString('base64')}`;
        if (headers.Authorization !== expected) return json(401, { error: 'invalid_client' });
        if (fake.rateLimitNext) {
          const retryAfter = fake.rateLimitNext;
          fake.rateLimitNext = null;
          return json(429, { message: 'You are being rate limited.', retry_after: retryAfter });
        }
        const form = new URLSearchParams(init.body);
        if (path === '/oauth2/token/revoke') {
          fake.calls.revoke += 1;
          fake.revoked.push(form.get('token'));
          refresh.delete(form.get('token'));
          access.delete(form.get('token'));
          return json(200, {});
        }
        let discordId;
        if (form.get('grant_type') === 'authorization_code') {
          const grant = codes.get(form.get('code'));
          codes.delete(form.get('code'));
          const challenge = createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url');
          if (
            !grant ||
            grant.challenge !== challenge ||
            grant.redirectUri !== form.get('redirect_uri')
          ) {
            return json(400, { error: 'invalid_grant' });
          }
          discordId = grant.userId;
        } else {
          fake.calls.refresh += 1;
          if (fake.refreshGate) await fake.refreshGate;
          discordId = refresh.get(form.get('refresh_token'));
          if (!discordId) return json(400, { error: 'invalid_grant' });
          refresh.delete(form.get('refresh_token')); // rotation: the old one dies at once
        }
        const a = token('access');
        const r = token('refresh');
        access.set(a, discordId);
        refresh.set(r, discordId);
        return json(200, {
          access_token: a,
          refresh_token: r,
          expires_in: 604800,
          token_type: 'Bearer',
          scope: DISCORD_TEST.scopes,
        });
      }
      const discordId = access.get((headers.Authorization ?? '').replace('Bearer ', ''));
      if (!discordId) return json(401, { message: '401: Unauthorized', code: 0 });
      const user = users.get(discordId);
      if (path === '/users/@me') return json(200, { id: user.id, username: user.username });
      if (path === `/users/@me/guilds/${DISCORD_TEST.guildId}/member`) {
        fake.calls.member += 1;
        if (!user.roles) return json(404, { message: 'Unbekannter Server', code: 10004 });
        return json(200, { roles: user.roles, nick: null, joined_at: '2024-09-22T19:31:13Z' });
      }
      return json(404, { message: 'Unknown', code: 0 });
    },
  };
  return fake;
}
