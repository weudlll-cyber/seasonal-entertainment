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
//              (the step names, no role ids) and what a step-gated room asks (passesStepRule).
// ============================================================

export const LADDERS = ['holder', 'farmer', 'investor'];
export const LADDER_NAMES = { holder: 'Holder', farmer: 'Farmer', investor: 'Investor' };

// The step names (decided 2026-11-02), lowest first. The Farmer ladder's middle steps follow
// the Holder ladder's names; admins rename, add and remove as the server has them.
const SEED = {
  holder: [
    'Holder',
    'Bronze',
    'Silver',
    'Golden',
    'Platinum',
    'Diamond',
    'Seasonal',
    'Ultimate',
    'Ultimate-Dragon Whale',
  ],
  farmer: [
    'Farmer Holder',
    'Farmer Bronze',
    'Farmer Silver',
    'Farmer Golden',
    'Farmer Platinum',
    'Farmer Diamond',
    'Farmer Seasonal',
    'Ultimate-Farmer Whale',
  ],
  investor: ['Level 1', 'Level 2', 'Level 3', 'Level 4'],
};

// Once: the step names without role ids. sqlite_sequence remembers any step ever added, so a
// list the admins emptied is not filled again. Returns how many were added.
export function seedSteps(db) {
  const seeded = db.prepare("SELECT 1 FROM sqlite_sequence WHERE name = 'discord_steps'").get();
  if (seeded) return 0;
  const insert = db.prepare('INSERT INTO discord_steps (ladder, name, position) VALUES (?, ?, ?)');
  let added = 0;
  db.transaction(() => {
    for (const ladder of LADDERS) {
      SEED[ladder].forEach((name, index) => {
        insert.run(ladder, name, index + 1);
        added += 1;
      });
    }
  })();
  return added;
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

// What the browser shows of a step: { ladder, name, icon } (icon: a /media URL or null).
export const shownSteps = (steps) =>
  steps.map(({ ladder, name, icon }) => ({ ladder, name, icon }));

// A step-gated room (room.stepRule: [{ ladder, position }] of the steps that open it) lets in
// whoever has, in any one of those ladders, that step or a higher one. Rooms without a rule
// are open as before; staff pass anyway (chat/viewer.js).
export function passesStepRule(stepRule, steps) {
  if (!stepRule?.length) return true;
  return stepRule.some((rule) =>
    steps.some((s) => s.ladder === rule.ladder && s.position >= rule.position)
  );
}
