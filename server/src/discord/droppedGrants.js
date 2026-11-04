// ============================================================
// File:        droppedGrants.js
// Path:        server/src/discord/droppedGrants.js
// Project:     Seasonal Entertainment
// Description: Grants from Discord the site does not keep are revoked at Discord (docs/AUTH.md,
//              "Discord: grants not kept"): a callback for someone already logged in, a sign-up
//              refused or never finished, a link refused. Revoking ends the member's whole
//              authorisation of the app, so it happens only while no account here holds that
//              Discord user (a linked account's stored grant must keep working). Best effort:
//              api.revoke answers false on any failure, and no token is ever logged. A held
//              sign-up (the session's discordSignup, routes.js) that times out is revoked when the
//              browser comes back, or by sweepSignups (run by the daily job's tick, refresh.js)
//              when it never does.
// ============================================================

import { findLinkByDiscordId } from './store.js';
import { openToken } from './tokenBox.js';

const SIGNUP_MS = 15 * 60_000; // from the callback to choosing a name

export const signupExpired = (signup, now = Date.now()) => now - signup.at >= SIGNUP_MS;

// A fresh refresh token that is not kept.
export async function dropGrant(db, discord, discordId, refreshToken) {
  if (findLinkByDiscordId(db, discordId)) return;
  await discord.api.revoke(refreshToken, 'refresh_token');
}

// A held sign-up that is given up: its token is sealed.
export async function dropSignup(db, discord, signup) {
  const token = await openToken(signup.sealedToken, discord.key).catch(() => null);
  if (token) await dropGrant(db, discord, signup.discordId, token);
}

// Sessions whose held sign-up timed out without the browser coming back: the sign-up leaves the
// session (only if the session did not change meanwhile) and its grant is revoked.
export async function sweepSignups(db, discord, now = Date.now()) {
  const rows = db
    .prepare("SELECT sid, sess FROM sessions WHERE json_extract(sess, '$.discordSignup.at') <= ?")
    .all(now - SIGNUP_MS);
  for (const row of rows) {
    const sess = JSON.parse(row.sess);
    const signup = sess.discordSignup;
    delete sess.discordSignup;
    const taken = db
      .prepare('UPDATE sessions SET sess = ? WHERE sid = ? AND sess = ?')
      .run(JSON.stringify(sess), row.sid, row.sess);
    if (taken.changes) await dropSignup(db, discord, signup);
  }
}
