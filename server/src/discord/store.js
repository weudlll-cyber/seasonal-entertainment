// ============================================================
// File:        store.js
// Path:        server/src/discord/store.js
// Project:     Seasonal Entertainment
// Description: Data access for accounts' Discord links (schema.js): find by account or by
//              Discord user, store a read (token, roles, state) in one statement, claim a link
//              for one refresh at a time, mark it as needing a Discord login, the links due for
//              the daily read, unlinking, and the role ids seen on members (for the admins'
//              mapping). The refresh token leaves this module only sealed.
// ============================================================

const DAY_MS = 24 * 60 * 60_000;
// A claim older than this is taken to be from a refresh that died (a crash): it may be retaken.
const CLAIM_MS = 2 * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const LINK_COLUMNS = `user_id AS userId, discord_id AS discordId, discord_name AS discordName,
  status, role_ids AS roleIds, linked_at AS linkedAt, refreshed_at AS refreshedAt,
  next_refresh_at AS nextRefreshAt, (refresh_token IS NOT NULL) AS hasToken`;

const toLink = (row) =>
  row && { ...row, roleIds: JSON.parse(row.roleIds), hasToken: row.hasToken === 1 };

export const findLink = (db, userId) =>
  toLink(db.prepare(`SELECT ${LINK_COLUMNS} FROM discord_links WHERE user_id = ?`).get(userId));

export const findLinkByDiscordId = (db, discordId) =>
  toLink(
    db.prepare(`SELECT ${LINK_COLUMNS} FROM discord_links WHERE discord_id = ?`).get(discordId)
  );

// The next daily read: a day on, plus up to an hour at random, so reads made at the same
// moment (a busy evening of logins) drift apart over the following days.
export const nextDailyRead = (now) => iso(now + DAY_MS + Math.floor(Math.random() * 60 * 60_000));

export class DiscordTakenError extends Error {}

// One read stored at once: the (new) sealed token, the roles and the state, and the next daily
// read; also releases the claim. Creates the link when the account has none (at linking or
// sign-up; the daily read uses saveRefreshed instead). A Discord user linked to another account is refused (DiscordTakenError).
// read: { discordId, discordName, sealedToken, status, roleIds }.
export function saveRead(db, userId, read, now = Date.now()) {
  let changes;
  try {
    ({ changes } = db
      .prepare(
        `INSERT INTO discord_links (user_id, discord_id, discord_name, refresh_token, status,
         role_ids, linked_at, refreshed_at, next_refresh_at)
       VALUES (@userId, @discordId, @discordName, @sealedToken, @status, @roleIds, @at, @at, @next)
       ON CONFLICT (user_id) DO UPDATE SET discord_name = excluded.discord_name,
         refresh_token = excluded.refresh_token, status = excluded.status,
         role_ids = excluded.role_ids, refreshed_at = excluded.refreshed_at,
         next_refresh_at = excluded.next_refresh_at, refreshing_since = NULL
       WHERE discord_links.discord_id = excluded.discord_id`
      )
      .run({
        userId,
        discordId: read.discordId,
        discordName: read.discordName,
        sealedToken: read.sealedToken,
        status: read.status,
        roleIds: JSON.stringify(read.roleIds),
        at: iso(now),
        next: nextDailyRead(now),
      }));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new DiscordTakenError();
    throw err;
  }
  // The account is linked to another Discord user: nothing was stored.
  if (changes === 0) throw new DiscordTakenError();
}

// The daily read's result, stored only into the link it claimed: an UPDATE, never an insert, so
// a link removed meanwhile (unlink, account deletion) or made anew (a Discord login, which
// clears the claim) is not brought back. Also releases the claim. Returns whether it was stored.
// read: { sealedToken, status, roleIds }.
export function saveRefreshed(db, userId, read, now = Date.now()) {
  const { changes } = db
    .prepare(
      `UPDATE discord_links SET refresh_token = @sealedToken, status = @status,
         role_ids = @roleIds, refreshed_at = @at, next_refresh_at = @next, refreshing_since = NULL
       WHERE user_id = @userId AND refreshing_since IS NOT NULL`
    )
    .run({
      userId,
      sealedToken: read.sealedToken,
      status: read.status,
      roleIds: JSON.stringify(read.roleIds),
      at: iso(now),
      next: nextDailyRead(now),
    });
  return changes > 0;
}

// Claims the link for one refresh: its sealed token, or null when there is none or another
// refresh holds it (never two at once: the second would use a token the first just made dead).
export function claimRefresh(db, userId, now = Date.now()) {
  return (
    db
      .prepare(
        `UPDATE discord_links SET refreshing_since = ?
         WHERE user_id = ? AND refresh_token IS NOT NULL
           AND (refreshing_since IS NULL OR refreshing_since < ?)
         RETURNING refresh_token AS token`
      )
      .get(iso(now), userId, iso(now - CLAIM_MS))?.token ?? null
  );
}

// A refresh that failed before Discord answered with new tokens: the old token still works;
// try again at retryAt.
export function releaseClaim(db, userId, retryAt) {
  db.prepare(
    'UPDATE discord_links SET refreshing_since = NULL, next_refresh_at = ? WHERE user_id = ?'
  ).run(iso(retryAt), userId);
}

// Discord refused the refresh token (invalid_grant): it is gone, and the steps stay hidden
// until the member logs in with Discord again (which stores a new one).
export function markNeedsLogin(db, userId, now = Date.now()) {
  db.prepare(
    `UPDATE discord_links SET refresh_token = NULL, status = 'needs_login',
       refreshing_since = NULL, next_refresh_at = ? WHERE user_id = ?`
  ).run(nextDailyRead(now), userId);
}

// Accounts whose daily read is due (and not claimed), oldest first.
export function dueLinks(db, now, limit) {
  return db
    .prepare(
      `SELECT user_id AS userId FROM discord_links
       WHERE next_refresh_at <= ? AND refresh_token IS NOT NULL
         AND (refreshing_since IS NULL OR refreshing_since < ?)
       ORDER BY next_refresh_at LIMIT ?`
    )
    .all(iso(now), iso(now - CLAIM_MS), limit)
    .map((r) => r.userId);
}

// Unlinking: the row goes; returns its sealed token (or null) so it can be revoked at Discord.
export function deleteLink(db, userId) {
  return (
    db
      .prepare('DELETE FROM discord_links WHERE user_id = ? RETURNING refresh_token AS token')
      .get(userId)?.token ?? null
  );
}

// The sealed token of a link, without claiming it (to revoke it before the account goes).
export const sealedTokenOf = (db, userId) =>
  db.prepare('SELECT refresh_token AS token FROM discord_links WHERE user_id = ?').get(userId)
    ?.token ?? null;

// How many members carry each role id (members on the server only): { roleId: count }.
export function roleIdCounts(db) {
  const counts = {};
  for (const { roleIds } of db
    .prepare("SELECT role_ids AS roleIds FROM discord_links WHERE status = 'member'")
    .all()) {
    for (const id of JSON.parse(roleIds)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
