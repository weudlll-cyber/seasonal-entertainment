// ============================================================
// File:        shared.js
// Path:        server/src/calls/shared.js
// Project:     Seasonal Entertainment
// Description: The one call shared with the games (decided 2026-11-24 and 2026-11-25;
//              docs/CALLS.md): which call has the flag, giving it to a scheduled or live call
//              (taking it from the other one only when asked to), taking it away, and the audit
//              entries, and the answer when another call has it. At most one call has it (also
//              an index, schema.js). Ending a call clears
//              it (store.js). The routes: sharedRoutes.js and, on create, routes.js.
// ============================================================

import { recordAudit } from '../audit/auditLog.js';

// { id, title } of the shared call, or null.
export const sharedCall = (db) =>
  db.prepare('SELECT id, title FROM calls WHERE shared_with_games = 1').get() ?? null;

const setFlag = (db, id, on) =>
  db.prepare('UPDATE calls SET shared_with_games = ? WHERE id = ?').run(on ? 1 : 0, id);

// The call that stands in the way of sharing call `id` (null: none).
export function sharedElsewhere(db, id = null) {
  const other = sharedCall(db);
  return other && other.id !== id ? other : null;
}

// The 409 that names the call in the way, so the page can ask whether to replace it.
export const answerSharedElsewhere = (res, other) =>
  res.status(409).json({
    ok: false,
    error: 'shared_elsewhere',
    message: `"${other.title}" is shared with the games already.`,
    call: other,
  });

// Makes `call` the shared one, in one transaction with unsharing `other` (the caller has asked
// to replace it), and audits both.
export function shareCall(db, actor, call, other) {
  db.transaction(() => {
    if (other) {
      setFlag(db, other.id, false);
      audit(db, actor, 'call.unshare', other, { replacedBy: call.id });
    }
    setFlag(db, call.id, true);
    audit(db, actor, 'call.share', call, other ? { replaced: other.id } : {});
  })();
}

export function unshareCall(db, actor, call) {
  db.transaction(() => {
    setFlag(db, call.id, false);
    audit(db, actor, 'call.unshare', call);
  })();
}

function audit(db, actor, action, call, more = {}) {
  recordAudit(db, actor, {
    action,
    targetType: 'call',
    targetId: call.id,
    after: { title: call.title, ...more },
  });
}
