// ============================================================
// File:        identityProof.js
// Path:        server/src/accounts/identityProof.js
// Project:     Seasonal Entertainment
// Description: "Prove it is you" before a sensitive change (docs/AUTH.md, "Discord: accounts
//              without a password"). An account with a password proves it with its auth key
//              (passwordProof.js), as everywhere. An account without one (made with Discord)
//              proves it with a fresh Discord login on this session: the callback stamps
//              session.discordProofAt, valid DISCORD_PROOF_MS. A taken-over session alone thus
//              can no more change the keys, set a first password or delete the account than it
//              can on a password account.
// ============================================================

import { sendError } from '../http/errors.js';
import { provesPassword } from './passwordProof.js';

export const DISCORD_PROOF_MS = 10 * 60_000;

export const freshDiscordProof = (session) =>
  typeof session?.discordProofAt === 'number' &&
  Date.now() - session.discordProofAt < DISCORD_PROOF_MS;

// When the session's Discord proof runs out (ISO), for the browser to ask for one in time; null
// when there is none.
export const discordProofUntil = (session) =>
  freshDiscordProof(session)
    ? new Date(session.discordProofAt + DISCORD_PROOF_MS).toISOString()
    : null;

// true when proven; otherwise answers (401) and returns false. authKey: the password's, for an
// account that has one (ignored otherwise).
export async function provesIdentity(db, config, req, res, authKey) {
  if (req.user.hasPassword) {
    if (await provesPassword(db, config, req.user.id, authKey)) return true;
    sendError(res, 401, 'invalid_credentials', 'The password is wrong.');
    return false;
  }
  if (freshDiscordProof(req.session)) return true;
  sendError(
    res,
    401,
    'discord_confirm_required',
    'Please confirm with Discord first: this account has no password.'
  );
  return false;
}
