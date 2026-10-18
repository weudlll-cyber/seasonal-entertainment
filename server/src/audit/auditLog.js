// ============================================================
// File:        auditLog.js
// Path:        server/src/audit/auditLog.js
// Project:     Seasonal Entertainment
// Description: The ONE way to write the audit log (every admin and moderation action calls
//              recordAudit), and the newest-first listing for the Audit page.
// ============================================================

const json = (value) => (value === undefined ? null : JSON.stringify(value));
const parse = (text) => (text === null ? null : JSON.parse(text));

// actor: the signed-in user doing it. action: a short verb phrase, e.g. "user.role".
// before/after: plain objects with only the fields that changed (never passwords).
export function recordAudit(db, actor, { action, targetType, targetId, before, after }) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, before, after)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actor.id,
    actor.username,
    action,
    targetType,
    targetId === undefined ? null : String(targetId),
    json(before),
    json(after)
  );
}

// Newest first; `beforeId` pages backwards through older entries.
export function listAudit(db, { limit = 50, beforeId } = {}) {
  const rows = db
    .prepare(
      `SELECT id, at, actor_name AS actor, action, target_type AS targetType,
              target_id AS targetId, before, after
       FROM audit_log WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`
    )
    .all(beforeId ?? null, beforeId ?? null, limit);
  return rows.map((row) => ({ ...row, before: parse(row.before), after: parse(row.after) }));
}
