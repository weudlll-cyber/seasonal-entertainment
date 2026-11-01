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
//              rest is deleted here: what the schemas keep with ON DELETE SET NULL or name only
//              as text (room messages and uploads, chat reports, the partners' read marks of the
//              conversations, sessions). The audit log and call recordings stay.
// ============================================================

import { deleteMediaFile } from '../media/files.js';
import { guardLastAdmin } from './userAdmin.js';

// Every file on disk that belongs to rows this deletion removes, as media paths.
function filesOf(db, userId) {
  const uploads = db
    .prepare('SELECT file, thumb_file AS thumbFile FROM chat_uploads WHERE user_id = ?')
    .all(userId)
    .flatMap((row) => [row.file, row.thumbFile]);
  // Direct files of both partners: the conversation goes for both (cascade below).
  const direct = db
    .prepare('SELECT file FROM direct_files WHERE uploader_id = ? OR partner_id = ?')
    .all(userId, userId)
    .map((row) => row.file);
  const reported = db
    .prepare(
      `SELECT f.file FROM direct_report_files f JOIN direct_reports r ON r.id = f.report_id
       WHERE r.reporter_id = ? OR r.partner_id = ?`
    )
    .all(userId, userId)
    .map((row) => row.file);
  return [...uploads, ...direct, ...reported].filter(Boolean);
}

// user: the account as loaded now. alsoInTransaction: more writes that must commit with the
// deletion or not at all (the admin route's audit entry). Throws LastAdminError (userAdmin.js)
// for the last active admin, before anything is deleted.
export function deleteAccount(db, config, user, alsoInTransaction = () => {}) {
  const files = db.transaction(() => {
    guardLastAdmin(db, user, { deleted: true });
    const found = filesOf(db, user.id);
    // chat_uploads and chat_messages keep their rows with SET NULL; here they go. Reports of
    // the deleted messages and mentions in them follow by cascade.
    db.prepare('DELETE FROM chat_uploads WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM chat_messages WHERE author_user_id = ?').run(user.id);
    // A room report names its reporter as text ("user:<id>", chat/routes.js), not as a key.
    db.prepare('DELETE FROM chat_reports WHERE reporter = ?').run(`user:${user.id}`);
    // The partners' read marks of their conversations with this account (target_id is the
    // partner's id, not a foreign key).
    db.prepare("DELETE FROM chat_reads WHERE scope = 'direct' AND target_id = ?").run(user.id);
    // Sessions are JSON in the session store's table; also a login half-way through 2FA.
    db.prepare(
      `DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?
         OR json_extract(sess, '$.pendingLogin.userId') = ?`
    ).run(user.id, user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    alsoInTransaction();
    return found;
  })();
  // Only after the commit: a deletion that failed leaves every file in place.
  for (const file of files) deleteMediaFile(config, file);
}
