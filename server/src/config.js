// ============================================================
// File:        config.js
// Path:        server/src/config.js
// Project:     Seasonal Entertainment
// Description: Reads the runtime configuration from environment variables at start time.
//              Nothing is baked into a build, so one build runs on any host. Every key is
//              listed in .env.example and docs/ARCHITECTURE.md.
// ============================================================

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = path.join(repoRoot, '.env');

function readInt(env, name, fallback, min, max) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${env[name]}"`);
  }
  return value;
}

function readBool(env, name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true' || value === 'false') return value === 'true';
  throw new Error(`${name} must be "true" or "false", got "${value}"`);
}

// Production refuses to start without a secret; development gets a random one per start
// (sessions then end on every restart) and a warning, as in the race game.
function readSessionSecret(env, isProduction) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (isProduction) throw new Error('SESSION_SECRET is required in production');
  console.warn('[config] SESSION_SECRET not set: using a random one, sessions end on restart');
  return randomBytes(32).toString('hex');
}

export function readConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  return {
    isProduction,
    host: env.HOST ?? '127.0.0.1',
    port: readInt(env, 'PORT', 3800, 1, 65535),
    // Built client served in production; missing folder simply means "API only".
    clientDist: path.resolve(env.CLIENT_DIST ?? path.join(repoRoot, 'client', 'dist')),
    databasePath: path.resolve(env.DATABASE_PATH ?? path.join(repoRoot, 'data', 'seasonal.db')),
    // The site's own origin (https://...), used by the CSRF and WebSocket origin checks.
    // Without it, the request's own Host header is taken: right locally, wrong behind a proxy.
    publicOrigin: env.PUBLIC_ORIGIN || null,
    trustProxy: readInt(env, 'TRUST_PROXY', 0, 0, 10),
    sessionSecret: readSessionSecret(env, isProduction),
    cookieSecure: readBool(env, 'COOKIE_SECURE', isProduction),
    // Strict: a state-changing request without Origin/Referer is refused. Stricter than the
    // race game (strict there only in production); curl users send an Origin header.
    csrfStrict: readBool(env, 'CSRF_STRICT', true),
    bootstrapToken: env.BOOTSTRAP_TOKEN || null,
    bcryptCost: readInt(env, 'BCRYPT_COST', 12, 4, 15),
    // Timers (session sweep, chat retention). Tests switch them off; not an env key.
    backgroundJobs: true,
    rateLimits: {
      login: { windowMs: 15 * 60_000, max: 10 }, // failed attempts per IP
      register: { windowMs: 60 * 60_000, max: 5 }, // registrations per IP
      passwordChange: { windowMs: 15 * 60_000, max: 5 }, // failed attempts per user
      bootstrap: { windowMs: 60 * 60_000, max: 10 }, // attempts per IP
    },
  };
}
