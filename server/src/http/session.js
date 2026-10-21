// ============================================================
// File:        session.js
// Path:        server/src/http/session.js
// Project:     Seasonal Entertainment
// Description: Cookie sessions stored server-side in the SQLite database (table "sessions"),
//              plus the per-request user lookup that ends sessions whose account was locked,
//              deleted, or had its password changed (session epoch, pattern from the race game).
//              A signed-in session ends after 7 days without use (decided 2026-10-22): every
//              authenticated request renews it to 7 days from then, at most once a minute
//              (one write per minute, not per request); the store's own per-request "touch"
//              is off. Signed-in sessions from before the rule are capped at 7 days on start.
//              A guest's session (a guest name, docs/CHAT.md) keeps its 30 days.
// ============================================================

import session from 'express-session';
import sqliteStoreFactory from 'better-sqlite3-session-store';
import { findUserById } from '../accounts/userStore.js';

const SqliteStore = sqliteStoreFactory(session);
const DAY_MS = 24 * 60 * 60 * 1000;
export const IDLE_LIMIT_MS = 7 * DAY_MS;
const GUEST_SESSION_MS = 30 * DAY_MS;
const RENEW_EVERY_MS = 60_000;
const SWEEP_MS = 15 * 60_000;

// The store's own sweep timer cannot be switched off (it reads "expired.clear || true") and is
// never unref'd, so it kept one-off scripts such as `npm run dev:admin` alive. Here the sweep
// runs only with background jobs, and never keeps the process alive on its own.
function storeClass(backgroundJobs) {
  return class SessionStore extends SqliteStore {
    startInterval() {
      if (backgroundJobs) setInterval(() => this.clearExpiredSessions(), SWEEP_MS).unref();
    }

    // Renewal is renewSession's, once a minute; the default touch wrote on every request.
    touch(_sid, _sess, cb) {
      cb?.();
    }
  };
}

// "__Host-" makes the browser refuse the cookie unless it is Secure, host-only and path "/".
export function cookieName(config) {
  return config.cookieSecure ? '__Host-se.sid' : 'se.sid';
}

export function sessionMiddleware(db, config) {
  const store = new (storeClass(config.backgroundJobs))({ client: db });
  // Signed-in sessions from the 30-day rule: at most 7 more days, unless they are used.
  const cap = new Date(Date.now() + IDLE_LIMIT_MS).toISOString();
  db.prepare(
    "UPDATE sessions SET expire = ? WHERE expire > ? AND json_extract(sess, '$.userId') IS NOT NULL"
  ).run(cap, cap);
  return session({
    name: cookieName(config),
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false, // guests get no cookie until something is stored for them
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: GUEST_SESSION_MS, // signed in: IDLE_LIMIT_MS (renewSession)
    },
  });
}

// Last used more than 7 days ago (usedAt: renewSession's stamp; a session from before the
// rule has none yet and gets one on its next request).
const idleTooLong = (session) =>
  session.usedAt !== undefined && Date.now() - session.usedAt > IDLE_LIMIT_MS;

// The account a session belongs to, or null when there is none or it no longer qualifies:
// deleted, locked, the session carries an older epoch, or it was not used for 7 days. Also
// used by the chat WebSocket.
export function sessionUser(db, session) {
  const id = session?.userId;
  if (id === undefined || idleTooLong(session)) return null;
  const user = findUserById(db, id);
  return user && !user.locked && user.sessionEpoch === session.sessionEpoch ? user : null;
}

// A used session lives 7 more days: the stamp and the cookie's (and the store's) expiry move,
// at most once a minute. Changing the session makes express-session save it and resend the
// cookie with the new expiry.
function renewSession(session) {
  const now = Date.now();
  if (session.usedAt !== undefined && now - session.usedAt < RENEW_EVERY_MS) return;
  session.usedAt = now;
  session.cookie.maxAge = IDLE_LIMIT_MS;
}

// Sets req.user (or null). A session whose account no longer qualifies, or that was not used
// for 7 days, is logged out here, on its very next request; a used one is renewed.
export function currentUser(db) {
  return (req, _res, next) => {
    req.user = sessionUser(db, req.session);
    if (req.user) renewSession(req.session);
    else if (req.session?.userId !== undefined) {
      delete req.session.userId;
      delete req.session.sessionEpoch;
      delete req.session.usedAt;
    }
    next();
  };
}

// Promise wrappers around the callback API.
const call = (req, method) =>
  new Promise((resolve, reject) => req.session[method]((err) => (err ? reject(err) : resolve())));

// Login: a fresh session id (no fixation), stamped with the account's current epoch.
export async function startSession(req, user) {
  await call(req, 'regenerate');
  req.session.userId = user.id;
  req.session.sessionEpoch = user.sessionEpoch;
  req.session.usedAt = Date.now();
  req.session.cookie.maxAge = IDLE_LIMIT_MS;
  await call(req, 'save');
}

// After an own password change: this session takes the new epoch and stays logged in.
export async function restampSession(req, sessionEpoch) {
  req.session.sessionEpoch = sessionEpoch;
  await call(req, 'save');
}

export async function endSession(req) {
  await call(req, 'destroy');
}
