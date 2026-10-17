// ============================================================
// File:        session.js
// Path:        server/src/http/session.js
// Project:     Seasonal Entertainment
// Description: Cookie sessions stored server-side in the SQLite database (table "sessions"),
//              plus the per-request user lookup that ends sessions whose account was locked,
//              deleted, or had its password changed (session epoch, pattern from the race game).
// ============================================================

import session from 'express-session';
import sqliteStoreFactory from 'better-sqlite3-session-store';
import { findUserById } from '../accounts/userStore.js';

const SqliteStore = sqliteStoreFactory(session);
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// "__Host-" makes the browser refuse the cookie unless it is Secure, host-only and path "/".
export function cookieName(config) {
  return config.cookieSecure ? '__Host-se.sid' : 'se.sid';
}

export function sessionMiddleware(db, config) {
  return session({
    name: cookieName(config),
    secret: config.sessionSecret,
    store: new SqliteStore({
      client: db,
      // The periodic sweep is a timer; tests switch it off so no timer outlives their DB.
      expired: { clear: config.backgroundJobs, intervalMs: 15 * 60_000 },
    }),
    resave: false,
    saveUninitialized: false, // guests get no cookie until something is stored for them
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: THIRTY_DAYS,
    },
  });
}

// The account a session belongs to, or null when there is none or it no longer qualifies:
// deleted, locked, or the session carries an older epoch. Also used by the chat WebSocket.
export function sessionUser(db, session) {
  const id = session?.userId;
  if (id === undefined) return null;
  const user = findUserById(db, id);
  return user && !user.locked && user.sessionEpoch === session.sessionEpoch ? user : null;
}

// Sets req.user (or null). A session whose account no longer qualifies is logged out here,
// on its very next request.
export function currentUser(db) {
  return (req, _res, next) => {
    req.user = sessionUser(db, req.session);
    if (!req.user && req.session?.userId !== undefined) {
      delete req.session.userId;
      delete req.session.sessionEpoch;
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
