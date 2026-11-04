// ============================================================
// File:        deletion.js
// Path:        server/src/accounts/deletion.js
// Project:     Seasonal Entertainment
// Description: Deleting an account (docs/AUTH.md, "Deleting an account"; decided 2026-11-01:
//              its room messages go at once). One transaction removes the account and
//              everything tied to it; the files on disk go right after it commits. Most rows go
//              by the schemas' ON DELETE CASCADE (2FA, keys, favourites, read marks, mutes,
//              mentions, sanctions, direct messages and direct files of both partners, direct
//              reports and their copies, embed tokens, call participation and reminders). The
//              chat's own rest (room messages and uploads, room reports, the partners' read
//              marks) and the files come from the chat handle (chat/accountData.js); the
//              sessions are deleted here. The audit log and call recordings stay. After the
//              commit the deletion is noted in the deletion journal (deletionJournal.js), so a
//              restore of an older backup deletes the account again. An account linked to
//              Discord has its token revoked at Discord after the commit (best effort).
// ============================================================

import { noteDeletion } from './deletionJournal.js';
import { guardLastAdmin } from './userAdmin.js';

// chatAccounts: the chat handle's accounts interface (chat/mount.js); journal: the deletion
// journal's file (config.deletionJournal; none when a restore deletes again); discord: the
// Discord handle (discord/index.js; none while not set up, and in a restore). user: the account
// as loaded now. alsoInTransaction: more writes that must commit with the deletion or not at
// all (the admin route's audit entry). Throws LastAdminError (userAdmin.js) for the last active
// admin, before anything is deleted.
export function deleteAccount(
  db,
  { chatAccounts, journal, discord },
  user,
  alsoInTransaction = () => {}
) {
  // The link row goes with the account (cascade): its token is read before.
  const revokeDiscord = discord?.revokerFor(user.id) ?? (() => {});
  const files = db.transaction(() => {
    guardLastAdmin(db, user, { deleted: true });
    const found = chatAccounts.deleteData(user.id);
    // Sessions are JSON in the session store's table; also a login half-way through 2FA.
    db.prepare(
      `DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?
         OR json_extract(sess, '$.pendingLogin.userId') = ?`
    ).run(user.id, user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    alsoInTransaction();
    return found;
  })();
  // Only after the commit: a deletion that failed leaves every file in place, and is never
  // journaled (a restore would delete an account that still exists).
  chatAccounts.deleteFiles(files);
  revokeDiscord();
  if (!journal) return;
  try {
    noteDeletion(journal, user);
  } catch (error) {
    // The account is gone; only a later restore would bring it back. Said loudly in the log.
    console.error(
      `[accounts] could not note deleted account ${user.id} in ${journal}: ${error.message}`
    );
  }
}
