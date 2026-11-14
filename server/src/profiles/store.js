// ============================================================
// File:        store.js
// Path:        server/src/profiles/store.js
// Project:     Seasonal Entertainment
// Description: Data access for member profiles (profiles/schema.js): one account's profile by
//              name (with its account's name, role, lock and creation time), setting About me,
//              putting or taking away the picture (returning the files that go, for the caller
//              to delete once the change is written), and the "Show my game results" switch.
// ============================================================

const now = () => new Date().toISOString();

// The account and its profile; null for no such account. Locked accounts are found too: the
// routes decide what that means.
export function findProfile(db, username) {
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.role, u.locked, u.created_at AS createdAt,
                COALESCE(p.about, '') AS about, p.picture_file AS pictureFile,
                p.picture_thumb AS pictureThumb, p.picture_mime AS pictureMime,
                p.picture_at AS pictureAt, COALESCE(p.hide_game_results, 0) AS hideGameResults
         FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id
         WHERE u.username = ?`
      )
      .get(username) ?? null
  );
}

// The row exists from the first change on.
function ensureRow(db, userId) {
  db.prepare(
    `INSERT INTO member_profiles (user_id, updated_at) VALUES (?, ?)
     ON CONFLICT (user_id) DO NOTHING`
  ).run(userId, now());
}

export function setAbout(db, userId, about) {
  ensureRow(db, userId);
  db.prepare('UPDATE member_profiles SET about = ?, updated_at = ? WHERE user_id = ?').run(
    about,
    now(),
    userId
  );
}

// "Show my game results" (games/memberSummary.js): shown true or false.
export function setGameResultsShown(db, userId, shown) {
  ensureRow(db, userId);
  db.prepare(
    'UPDATE member_profiles SET hide_game_results = ?, updated_at = ? WHERE user_id = ?'
  ).run(shown ? 0 : 1, now(), userId);
}

// The picture's files now, as media paths (none: []).
function pictureFiles(db, userId) {
  const row = db
    .prepare(
      'SELECT picture_file AS file, picture_thumb AS thumb FROM member_profiles WHERE user_id = ?'
    )
    .get(userId);
  return [row?.file, row?.thumb].filter(Boolean);
}

// stored: processUpload's result (file, thumbFile, mime). Returns the replaced picture's files.
export function setPicture(db, userId, stored) {
  return db.transaction(() => {
    const replaced = pictureFiles(db, userId);
    ensureRow(db, userId);
    db.prepare(
      `UPDATE member_profiles SET picture_file = ?, picture_thumb = ?, picture_mime = ?,
              picture_at = ?, updated_at = ? WHERE user_id = ?`
    ).run(stored.file, stored.thumbFile, stored.mime, now(), now(), userId);
    return replaced;
  })();
}

// Returns the removed picture's files ([] when there was none).
export function removePicture(db, userId) {
  return db.transaction(() => {
    const removed = pictureFiles(db, userId);
    db.prepare(
      `UPDATE member_profiles SET picture_file = NULL, picture_thumb = NULL, picture_mime = NULL,
              picture_at = NULL, updated_at = ? WHERE user_id = ?`
    ).run(now(), userId);
    return removed;
  })();
}

// For the account's deletion (chat/accountData.js): the picture's files.
export const profileFilesOf = pictureFiles;
