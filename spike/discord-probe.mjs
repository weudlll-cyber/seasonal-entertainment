// ============================================================
// File:        discord-probe.mjs
// Path:        spike/discord-probe.mjs
// Project:     Seasonal Entertainment
// Description: Throwaway probe (SE-DISCORD-0, branch spike/discord-probe, never merged): one
//              Discord OAuth2 authorization-code login with state and PKCE, scopes identify and
//              guilds.members.read, then what the build needs to know: the user's id and name,
//              the member record on the Seasonal Tokens server, a refresh without the user, the
//              stated lifetimes and rate-limit headers, and the answer for a server the user is
//              not on. Tokens live in memory only, are revoked at the end and never printed;
//              the client secret is read from the owner's file and never printed either. Not
//              part of the site.
// Usage:       node spike/discord-probe.mjs (listens on localhost:5380, the registered redirect)
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLIENT_ID = '1566923848543117513';
const GUILD_ID = '902220302199689266';
const DRAGON_WHALE_ROLE = '1530712031215226932';
const PORT = 5380;
const REDIRECT_URI = `http://localhost:${PORT}/api/auth/discord/callback`;
const API = 'https://discord.com/api/v10';
const WAIT_MS = 10 * 60_000;

const secret = readFileSync(
  join(homedir(), '.seasonal', 'discord-client-secret.txt'),
  'utf8'
).trim();
const clientAuth = `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString('base64')}`;

const state = randomBytes(16).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

// Only Discord's rate-limit headers: they size the daily refresh.
function rateLimits(response) {
  const shown = {};
  for (const [name, value] of response.headers)
    if (name.startsWith('x-ratelimit')) shown[name] = value;
  return shown;
}

async function tokenRequest(form) {
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: clientAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const body = await response.json();
  // An error body holds no token; a success body is never printed.
  if (!response.ok) throw new Error(`token ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function api(path, accessToken) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, limits: rateLimits(response), body: await response.json() };
}

async function revoke(token, hint) {
  const response = await fetch(`${API}/oauth2/token/revoke`, {
    method: 'POST',
    headers: { Authorization: clientAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, token_type_hint: hint }),
  });
  return response.status;
}

function memberReport(member) {
  return {
    fields: Object.keys(member).sort(),
    roleCount: member.roles.length,
    roleIds: member.roles,
    nicknameSet: member.nick != null,
    joinedAt: member.joined_at,
    hasDragonWhaleRole: member.roles.includes(DRAGON_WHALE_ROLE) ? 'yes' : 'no',
  };
}

// A snowflake for "now": a server id nobody can be a member of.
const unknownGuild = ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();

async function probe(code) {
  const first = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  console.log(
    'token: granted scope',
    first.scope,
    '| expires_in',
    first.expires_in,
    's',
    '| token_type',
    first.token_type,
    '| fields',
    Object.keys(first).sort().join(',')
  );

  const me = await api('/users/@me', first.access_token);
  console.log('users/@me', me.status, { id: me.body.id, username: me.body.username });

  const member = await api(`/users/@me/guilds/${GUILD_ID}/member`, first.access_token);
  console.log(
    'member',
    member.status,
    member.status === 200 ? memberReport(member.body) : member.body
  );
  console.log('member rate limits', member.limits);

  const again = await api(`/users/@me/guilds/${GUILD_ID}/member`, first.access_token);
  console.log('member again', again.status, 'rate limits', again.limits);

  const outside = await api(`/users/@me/guilds/${unknownGuild}/member`, first.access_token);
  console.log(
    'member of a server the user is not on',
    outside.status,
    outside.body,
    outside.limits
  );

  const second = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: first.refresh_token,
  });
  console.log(
    'refresh: granted scope',
    second.scope,
    '| expires_in',
    second.expires_in,
    's',
    '| refresh token rotated',
    second.refresh_token !== first.refresh_token,
    '| fields',
    Object.keys(second).sort().join(',')
  );

  const refreshed = await api(`/users/@me/guilds/${GUILD_ID}/member`, second.access_token);
  console.log(
    'member after refresh',
    refreshed.status,
    refreshed.status === 200 ? { roleCount: refreshed.body.roles.length } : refreshed.body,
    refreshed.limits
  );

  const oldAccess = await api('/users/@me', first.access_token);
  console.log('first access token after the refresh:', oldAccess.status);
  const oldRefresh = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: first.refresh_token,
  }).then(
    () => 'still works',
    (error) => error.message
  );
  console.log('first refresh token after the refresh:', oldRefresh);

  console.log('revoke', {
    secondRefresh: await revoke(second.refresh_token, 'refresh_token'),
    secondAccess: await revoke(second.access_token, 'access_token'),
    firstAccess: await revoke(first.access_token, 'access_token'),
  });
  const after = await api('/users/@me', second.access_token);
  console.log('access token after revoking:', after.status);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/api/auth/discord/callback') {
    res.writeHead(404).end();
    return;
  }
  const page = (text) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><p>${text}</p>`);
  };
  if (url.searchParams.get('state') !== state) {
    page('Falscher Zustand (state) – abgebrochen.');
    console.log('callback with a wrong state: refused');
  } else if (url.searchParams.get('error')) {
    page('Abgelehnt – nichts gespeichert.');
    console.log('callback error:', url.searchParams.get('error'));
  } else {
    page('Danke, fertig. Du kannst dieses Fenster schließen.');
    try {
      await probe(url.searchParams.get('code'));
    } catch (error) {
      console.log('probe failed:', error.message);
    }
  }
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'identify guilds.members.read',
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });
  console.log('waiting on port', PORT, '- authorize URL:', authorize.href);
  // rundll32 hands the URL to the default browser untouched (cmd's start would split it at &).
  spawn('rundll32', ['url.dll,FileProtocolHandler', authorize.href], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  setTimeout(() => {
    console.log('no answer within 10 minutes: stopped');
    process.exit(1);
  }, WAIT_MS).unref();
});
