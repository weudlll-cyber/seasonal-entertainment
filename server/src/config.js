// ============================================================
// File:        config.js
// Path:        server/src/config.js
// Project:     Seasonal Entertainment
// Description: Reads the runtime configuration from environment variables at start time.
//              Nothing is baked into a build, so one build runs on any host. Every key is
//              listed in .env.example (test/envExample.test.js) and docs/ARCHITECTURE.md.
//              The call service's keys are read by calls/config.js; what production refuses
//              to start with is checked by productionConfig.js.
// ============================================================

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCallsConfig } from './calls/config.js';
import { checkProduction } from './productionConfig.js';

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

// Organisers and admins must use 2FA. Switching that off is for local development only.
function readStaff2fa(env, isProduction) {
  const required = readBool(env, 'REQUIRE_STAFF_2FA', true);
  if (!required && isProduction)
    throw new Error('REQUIRE_STAFF_2FA=false is not allowed in production');
  return required;
}

export function readConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const config = {
    isProduction,
    host: env.HOST ?? '127.0.0.1',
    port: readInt(env, 'PORT', 3800, 1, 65535),
    // Built client served in production; missing folder simply means "API only".
    clientDist: path.resolve(env.CLIENT_DIST ?? path.join(repoRoot, 'client', 'dist')),
    databasePath: path.resolve(env.DATABASE_PATH ?? path.join(repoRoot, 'data', 'seasonal.db')),
    // Chat media files (library and link-preview images), served at /media.
    mediaDir: path.resolve(env.MEDIA_DIR ?? path.join(repoRoot, 'data', 'media')),
    // Chat file uploads by members (decided 2026-10-17): images and PDF.
    uploads: {
      maxBytes: 10 * 1024 * 1024, // per file
      dailyBytes: 50 * 1024 * 1024, // per member in 24 hours
      thumbWidth: 480,
      pendingMinutes: 60, // uploaded but never sent: deleted after this
      nameMax: 100, // the original file name, kept as display text only
    },
    // Library upload limits per pack kind (decided 2026-10-17).
    media: {
      sticker: { maxBytes: 512 * 1024, maxSide: 1024 },
      gif: { maxBytes: 3 * 1024 * 1024, maxSide: 640 },
    },
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
    requireStaff2fa: readStaff2fa(env, isProduction),
    // The call service (LiveKit, docs/CALLS.md); null when not configured (feature off).
    calls: readCallsConfig(env, isProduction),
    chat: {
      // Messages older than this are deleted by the retention job.
      retentionDays: readInt(env, 'CHAT_RETENTION_DAYS', 90, 1, 3650),
      // Per sender; guests stricter (decided 2026-10-17).
      rate: {
        member: { windowMs: 10_000, max: 5 },
        guest: { windowMs: 10_000, max: 2 },
      },
    },
    // Link previews in the chat (decided 2026-10-17). Only LINK_PREVIEWS is an env key.
    linkPreviews: {
      enabled: readBool(env, 'LINK_PREVIEWS', true),
      timeoutMs: 5000, // page and image together
      maxRedirects: 3,
      maxHtmlBytes: 1024 * 1024,
      maxImageBytes: 1024 * 1024,
      imageMaxWidth: 480,
      cacheHours: 24,
      perUser: { windowMs: 60 * 60_000, max: 30 }, // fetches per member
      overall: { windowMs: 60_000, max: 60 }, // fetches for the whole site
      userAgent:
        'SeasonalEntertainmentPreview/1.0 (link previews for the Seasonal Entertainment chat)',
      titleMax: 120,
      descriptionMax: 300,
      siteNameMax: 60,
    },
    // Timers (session sweep, chat retention). Tests switch them off; not an env key.
    backgroundJobs: true,
    rateLimits: {
      login: { windowMs: 15 * 60_000, max: 10 }, // failed attempts per IP
      loginAccount: { windowMs: 15 * 60_000, max: 10 }, // failed attempts per username
      register: { windowMs: 60 * 60_000, max: 5 }, // registrations per IP
      passwordChange: { windowMs: 15 * 60_000, max: 5 }, // failed attempts per user
      bootstrap: { windowMs: 60 * 60_000, max: 10 }, // attempts per IP
      twoFactor: { windowMs: 15 * 60_000, max: 5 }, // failed codes per user / per IP at login
      chatReport: { windowMs: 60_000, max: 10 }, // chat reports per IP
      memberSearch: { windowMs: 60_000, max: 60 }, // member searches per account
      // Guests per IP, so clearing cookies does not reset them. In memory, no IP is stored.
      chatGuestPost: { windowMs: 60_000, max: 20 }, // guest messages per IP
      chatNewGuest: { windowMs: 60 * 60_000, max: 20 }, // new guest names per IP
      chatUpload: { windowMs: 60_000, max: 10 }, // file uploads per member
      callManage: { windowMs: 60_000, max: 30 }, // call management actions per organiser
      callJoin: { windowMs: 60_000, max: 30 }, // call joins per IP (guests have no account)
      callAction: { windowMs: 60_000, max: 60 }, // hands, stage, mute, spotlight per account
    },
  };
  if (isProduction) checkProduction(env, config);
  return config;
}
