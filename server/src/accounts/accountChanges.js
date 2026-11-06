// ============================================================
// File:        accountChanges.js
// Path:        server/src/accounts/accountChanges.js
// Project:     Seasonal Entertainment
// Description: The account changes the embedded games must learn of (decided 2026-11-04: the
//              site reports every account change that matters to Seasonal Bingo Royale and
//              Seasonal Mini Games, which then end that player's game session; a deleted account
//              becomes "Deleted player" there). Noted in the same transaction as the change:
//              deleted (deletion.js), locked and unlocked (userAdmin.js setLocked), rights
//              (setRole, setCanStartGames) — the user id, the kind and the time, nothing else,
//              kept CHANGES_KEEP_DAYS. One feed for all games: each reads it in order through
//              GET /api/games/<slug>/account-changes (games/embeddedRoutes.js), from its own
//              cursor (the table's seq, which never goes back).
// ============================================================

export const CHANGE_KINDS = ['deleted', 'locked', 'unlocked', 'rights'];
export const CHANGES_KEEP_DAYS = 365;
export const CHANGES_PAGE = 500;

// Inside the change's transaction; entries older than the keep time go at the same time.
export function noteAccountChange(db, userId, kind, now = Date.now()) {
  db.prepare('INSERT INTO account_changes (user_id, kind, changed_at) VALUES (?, ?, ?)').run(
    userId,
    kind,
    new Date(now).toISOString()
  );
  const before = new Date(now - CHANGES_KEEP_DAYS * 24 * 60 * 60_000).toISOString();
  db.prepare('DELETE FROM account_changes WHERE changed_at < ?').run(before);
}

// The changes after the cursor `since` (0: from the start), in order, at most CHANGES_PAGE;
// next: the cursor to ask with next time (unchanged when there is nothing new).
export function accountChangesSince(db, since) {
  const rows = db
    .prepare(
      'SELECT seq, user_id AS id, kind FROM account_changes WHERE seq > ? ORDER BY seq LIMIT ?'
    )
    .all(since, CHANGES_PAGE);
  return {
    changes: rows.map(({ id, kind }) => ({ id, kind })),
    next: String(rows.length ? rows.at(-1).seq : since),
  };
}
