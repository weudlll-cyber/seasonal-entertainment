// ============================================================
// File:        steps.js
// Path:        server/src/discord/steps.js
// Project:     Seasonal Entertainment
// Description: The steps members carry from the Seasonal Tokens Discord server (docs/AUTH.md,
//              "Discord: steps"; decided 2026-11-02): three ladders (Holder, Farmer, Investor),
//              each an ordered list of steps the admins keep, each step given by one Discord role
//              id and shown with its icon. A member shows only their highest step per ladder,
//              computed when asked from the role ids last read and the mapping now, so a mapping
//              change takes effect at once. Accounts whose link needs a Discord login, or who are
//              not on the server, have none. Steps never grant rights on the site. Also the seed
//              (the steps shipped with the project, seed/steps.json, inserted once) and what a
//              step-gated room asks (passesStepRule).
// ============================================================

import { readFileSync } from 'node:fs';
import { LADDERS } from '@seasonal-entertainment/shared/discordLadders.js';

export { LADDERS };

// The steps the site starts with: seed/steps.json (ladder, name, position, role id, icon file
// in seed/icons/), written from a database by scripts/export-steps.mjs. Steps only: no accounts,
// tokens or ids of the application or server.
export const STEP_SEED_FILE = new URL('./seed/steps.json', import.meta.url);

// [{ ladder, name, position, roleId, icon }] with icon the file's bytes (or null).
export function readStepSeed(file = STEP_SEED_FILE) {
  const { steps } = JSON.parse(readFileSync(file, 'utf8'));
  return steps.map(({ icon, ...step }) => ({
    ...step,
    icon: icon ? readFileSync(new URL(`icons/${icon}`, file)) : null,
  }));
}

// Once, into a database that never had a step (sqlite_sequence remembers any step ever added, so
// admins' edits are never undone and a list they emptied is not filled again). Icons go through
// storeIcon (the chat handle's images.storeIcon: the upload pipeline); one it refuses is left
// out, the step kept. Returns how many steps were added.
export async function seedSteps(db, { seed = readStepSeed(), storeIcon } = {}) {
  const seeded = () =>
    db.prepare("SELECT 1 FROM sqlite_sequence WHERE name = 'discord_steps'").get();
  if (seeded()) return 0;
  const iconFiles = [];
  for (const step of seed) {
    const stored = step.icon && storeIcon ? await storeIcon(step.icon) : null;
    if (stored && !stored.ok)
      console.warn(`[steps] seed icon of ${step.name} refused: ${stored.message}`);
    iconFiles.push(stored?.ok ? stored.file : null);
  }
  const insert = db.prepare(
    'INSERT INTO discord_steps (ladder, name, position, role_id, icon_file) VALUES (?, ?, ?, ?, ?)'
  );
  return db.transaction(() => {
    // Checked again inside the write: the icons took a moment.
    if (seeded()) return 0;
    seed.forEach((step, index) =>
      insert.run(step.ladder, step.name, step.position, step.roleId ?? null, iconFiles[index])
    );
    return seed.length;
  })();
}

// iconFile: the icon's file in the media folder (step-icons/...), or null; its public address
// comes from the chat's media handle (urlOf below), which serves the folder.
export const STEP_COLUMNS = `id, ladder, name, position, role_id AS roleId, icon_file AS iconFile`;

// Every step, by ladder and order.
export const listSteps = (db) =>
  db
    .prepare(
      `SELECT ${STEP_COLUMNS} FROM discord_steps
       ORDER BY CASE ladder WHEN 'holder' THEN 1 WHEN 'farmer' THEN 2 ELSE 3 END, position, id`
    )
    .all();

// The highest mapped step per ladder for each account: Map userId -> [{ id, ladder, position,
// name, iconFile }] in ladder order (Holder, Farmer, Investor). Accounts without steps are
// absent.
export function stepsOfUsers(db, userIds) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id));
  const result = new Map();
  if (ids.length === 0) return result;
  const links = db
    .prepare(
      `SELECT user_id AS userId, role_ids AS roleIds FROM discord_links
       WHERE status = 'member' AND user_id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  if (links.length === 0) return result;
  const byRole = new Map(
    listSteps(db)
      .filter((s) => s.roleId)
      .map((s) => [s.roleId, s])
  );
  for (const { userId, roleIds } of links) {
    const top = {};
    for (const roleId of JSON.parse(roleIds)) {
      const step = byRole.get(roleId);
      if (step && (!top[step.ladder] || step.position > top[step.ladder].position)) {
        top[step.ladder] = step;
      }
    }
    const steps = LADDERS.filter((l) => top[l]).map((l) => {
      const { roleId: _roleId, ...shown } = top[l];
      return shown;
    });
    if (steps.length) result.set(userId, steps);
  }
  return result;
}

export const stepsOfUser = (db, userId) => stepsOfUsers(db, [userId]).get(userId) ?? [];

// What the browser shows of a step: { ladder, name, icon } (icon: the icon's public address,
// urlOf(iconFile), or null for the neutral placeholder). urlOf: the media address of a stored
// file (the chat handle's images.url; inside the chat area, media/files.js mediaUrl).
export const shownSteps = (steps, urlOf) =>
  steps.map(({ ladder, name, iconFile }) => ({
    ladder,
    name,
    icon: iconFile ? urlOf(iconFile) : null,
  }));

// A step-gated room (room.stepRule: [{ ladder, position }] of the steps that open it) lets in
// whoever has, in any one of those ladders, that step or a higher one. Rooms without a rule
// are open as before; staff pass anyway (chat/viewer.js).
export function passesStepRule(stepRule, steps) {
  if (!stepRule?.length) return true;
  return stepRule.some((rule) =>
    steps.some((s) => s.ladder === rule.ladder && s.position >= rule.position)
  );
}
