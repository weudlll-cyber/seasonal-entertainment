// ============================================================
// File:        api.js
// Path:        server/src/discord/api.js
// Project:     Seasonal Entertainment
// Description: The few Discord API calls the site makes (docs/AUTH.md, "Discord"): exchange an
//              authorization code (with the PKCE verifier) or a refresh token for tokens, read
//              the user (/users/@me: id and name only are kept), read their member record on the
//              Seasonal Tokens server (roles only are kept), and revoke a token. The client
//              secret travels only in the Authorization header to Discord. Errors carry Discord's
//              status and error code, never a token: DiscordError.kind is 'invalid_grant' (the
//              refresh token is dead: log in with Discord again), 'not_member' (404 with code
//              10004; the code, never the localized text, decides), 'rate_limited' (with
//              retryAfterMs) or 'failed'. fetchImpl: the global fetch, or the tests' stand-in.
// ============================================================

export class DiscordError extends Error {
  constructor(kind, status, detail = {}) {
    super(`Discord ${kind} (${status})`);
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = detail.retryAfterMs ?? null;
  }
}

const UNKNOWN_GUILD = 10004;

async function body(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function refusal(response, data) {
  if (response.status === 429) {
    const seconds = Number(data.retry_after ?? response.headers.get('retry-after') ?? 60);
    return new DiscordError('rate_limited', 429, { retryAfterMs: Math.ceil(seconds * 1000) });
  }
  if (data.error === 'invalid_grant') return new DiscordError('invalid_grant', response.status);
  if (response.status === 404 && data.code === UNKNOWN_GUILD) {
    return new DiscordError('not_member', 404);
  }
  return new DiscordError('failed', response.status);
}

export function discordApi(config, fetchImpl = globalThis.fetch) {
  const clientAuth = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
  async function call(path, init) {
    let response;
    try {
      response = await fetchImpl(`${config.apiBase}${path}`, {
        ...init,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      throw new DiscordError('failed', 0);
    }
    const data = await body(response);
    if (!response.ok) throw refusal(response, data);
    return data;
  }
  const form = (fields) => ({
    method: 'POST',
    headers: { Authorization: clientAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const bearer = (accessToken) => ({ headers: { Authorization: `Bearer ${accessToken}` } });

  // { accessToken, refreshToken } from Discord's token answer.
  const tokens = (data) => ({ accessToken: data.access_token, refreshToken: data.refresh_token });

  return {
    async exchangeCode(code, verifier, redirectUri) {
      return tokens(
        await call(
          '/oauth2/token',
          form({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          })
        )
      );
    },
    // Discord rotates: the refresh token given here is dead once this succeeds.
    async refresh(refreshToken) {
      return tokens(
        await call(
          '/oauth2/token',
          form({ grant_type: 'refresh_token', refresh_token: refreshToken })
        )
      );
    },
    async user(accessToken) {
      const data = await call('/users/@me', bearer(accessToken));
      return { id: String(data.id), username: String(data.username ?? '') };
    },
    // The member's role ids on the configured server (strings, Discord's snowflakes).
    async memberRoles(accessToken) {
      const data = await call(`/users/@me/guilds/${config.guildId}/member`, bearer(accessToken));
      return Array.isArray(data.roles) ? data.roles.map(String) : [];
    },
    // Best effort: a token that is already dead or unknown is fine.
    async revoke(token, hint) {
      try {
        await call('/oauth2/token/revoke', form({ token, token_type_hint: hint }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
