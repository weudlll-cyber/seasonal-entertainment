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
//              when it never does. A registration claims its sign-up from the session row
//              (claimSignup), so it and the sweep never both take the same one.
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

// A registration takes its held sign-up out of the session row before it uses it, inside the
// transaction that stores the link: true only while the row still holds that sign-up and it has
// not timed out. The sweep takes sign-ups out of the same rows, so exactly one of the two gets
// it: a registration never stores a grant the sweep is revoking, and the sweep never revokes
// one a registration took. The request's own copy of the session cannot tell (it was read when
// the request began, possibly before the sweep).
export function claimSignup(db, sid, signup, now = Date.now()) {
  if (signupExpired(signup, now)) return false;
  return (
    db
      .prepare(
        `UPDATE sessions SET sess = json_remove(sess, '$.discordSignup') WHERE sid = ?
         AND json_extract(sess, '$.discordSignup.at') = ?
         AND json_extract(sess, '$.discordSignup.discordId') = ?`
      )
      .run(sid, signup.at, signup.discordId).changes === 1
  );
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
