// ============================================================
// File:        stepStore.js
// Path:        server/src/discord/stepStore.js
// Project:     Seasonal Entertainment
// Description: The admins' changes to the Discord steps (docs/AUTH.md, "Discord: steps";
//              adminRoutes.js): add a step at the top of its ladder, rename it and set the
//              Discord role id that gives it, reorder a ladder, set or clear its icon, remove it
//              (refused while a room names it), and the role ids seen on members that no step
//              has yet. Reading and computing steps: steps.js.
// ============================================================

import { STEP_COLUMNS, listSteps } from './steps.js';
import { roleIdCounts } from './store.js';

export const findStep = (db, id) =>
  db.prepare(`SELECT ${STEP_COLUMNS} FROM discord_steps WHERE id = ?`).get(id) ?? null;

export class RoleIdTakenError extends Error {}
export class StepInUseError extends Error {}

const unique = (work) => {
  try {
    return work();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new RoleIdTakenError();
    throw err;
  }
};

// A new step, the highest of its ladder. roleId: a Discord role id or null.
export function addStep(db, { ladder, name, roleId }) {
  return unique(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO discord_steps (ladder, name, role_id, position)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM discord_steps WHERE ladder = ?))`
      )
      .run(ladder, name, roleId, ladder);
    return findStep(db, Number(lastInsertRowid));
  });
}

export function updateStep(db, id, { name, roleId }) {
  return unique(() => {
    db.prepare('UPDATE discord_steps SET name = ?, role_id = ? WHERE id = ?').run(name, roleId, id);
    return findStep(db, id);
  });
}

// ids: every step of the ladder, lowest first.
export function reorderLadder(db, ids) {
  const update = db.prepare('UPDATE discord_steps SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))();
}

export const ladderIds = (db, ladder) =>
  db
    .prepare('SELECT id FROM discord_steps WHERE ladder = ? ORDER BY position, id')
    .all(ladder)
    .map((r) => r.id);

// Returns the old icon's file (to delete), or null.
export function setIcon(db, id, file) {
  const old = findStep(db, id)?.iconFile ?? null;
  db.prepare('UPDATE discord_steps SET icon_file = ? WHERE id = ?').run(file, id);
  return old;
}

// Refused (StepInUseError) while a room's rule names the step: removing it would open the room.
export function removeStep(db, id) {
  try {
    db.prepare('DELETE FROM discord_steps WHERE id = ?').run(id);
  } catch (err) {
    // SQLite reports a RESTRICT refusal as a trigger constraint (a deferred check would be
    // FOREIGNKEY); both mean a room still names the step.
    if (err.code === 'SQLITE_CONSTRAINT_TRIGGER' || err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new StepInUseError();
    }
    throw err;
  }
}

// Role ids members carry that no step has: [{ roleId, members }], most common first.
export function unmappedRoleIds(db) {
  const mapped = new Set(
    listSteps(db)
      .map((s) => s.roleId)
      .filter(Boolean)
  );
  return Object.entries(roleIdCounts(db))
    .filter(([roleId]) => !mapped.has(roleId))
    .map(([roleId, members]) => ({ roleId, members }))
    .sort((a, b) => b.members - a.members || a.roleId.localeCompare(b.roleId));
}
