// ============================================================
// File:        config.js
// Path:        server/src/discord/config.js
// Project:     Seasonal Entertainment
// Description: The Discord login's configuration (docs/AUTH.md, "Discord"): the application's
//              client id and secret and the Seasonal Tokens server whose roles are read. All
//              three or the feature is off (null): no button, and every /api/auth/discord route
//              answers 404. The secret comes from DISCORD_CLIENT_SECRET or from the file
//              DISCORD_CLIENT_SECRET_FILE names (the installer's way, so it never sits in a
//              shell history); it is kept in memory only and never logged or sent to a browser.
//              The redirect is DISCORD_REDIRECT_URI, or PUBLIC_ORIGIN + the callback path; it
//              must be registered at Discord exactly, character for character.
// ============================================================

import { readFileSync } from 'node:fs';

export const CALLBACK_PATH = '/api/auth/discord/callback';
const SNOWFLAKE = /^\d{17,20}$/;

function readSecret(env) {
  if (env.DISCORD_CLIENT_SECRET) return env.DISCORD_CLIENT_SECRET.trim();
  if (!env.DISCORD_CLIENT_SECRET_FILE) return '';
  try {
    return readFileSync(env.DISCORD_CLIENT_SECRET_FILE, 'utf8').trim();
  } catch {
    // The file's name only, never its content.
    throw new Error(`DISCORD_CLIENT_SECRET_FILE cannot be read: ${env.DISCORD_CLIENT_SECRET_FILE}`);
  }
}

// null when Discord is not set up. publicOrigin: PUBLIC_ORIGIN (or null in development, where
// the callback's address comes from DISCORD_REDIRECT_URI or the request itself, routes.js).
export function readDiscordConfig(env, publicOrigin) {
  const clientId = (env.DISCORD_CLIENT_ID ?? '').trim();
  const guildId = (env.DISCORD_GUILD_ID ?? '').trim();
  const clientSecret = readSecret(env);
  if (!clientId && !guildId && !clientSecret) return null;
  if (!clientId || !guildId || !clientSecret) {
    throw new Error(
      'Discord login needs DISCORD_CLIENT_ID, DISCORD_GUILD_ID and a client secret ' +
        '(DISCORD_CLIENT_SECRET or DISCORD_CLIENT_SECRET_FILE), or none of them'
    );
  }
  for (const [name, value] of [
    ['DISCORD_CLIENT_ID', clientId],
    ['DISCORD_GUILD_ID', guildId],
  ]) {
    if (!SNOWFLAKE.test(value)) throw new Error(`${name} must be a Discord id (digits only)`);
  }
  const redirectUri =
    (env.DISCORD_REDIRECT_URI ?? '').trim() ||
    (publicOrigin ? `${publicOrigin}${CALLBACK_PATH}` : null);
  return {
    clientId,
    clientSecret,
    guildId,
    redirectUri,
    apiBase: 'https://discord.com/api/v10',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    // Only these: no "guilds" (all of a member's servers), no "email" (decided 2026-11-02).
    scopes: 'identify guilds.members.read',
    timeoutMs: 10_000,
  };
}
