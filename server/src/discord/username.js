// ============================================================
// File:        username.js
// Path:        server/src/discord/username.js
// Project:     Seasonal Entertainment
// Description: The username offered at a sign-up with Discord (docs/AUTH.md, "Discord"): the
//              Discord username made to fit the site's rules (shared/accountRules.js: 3-24
//              characters, letters, digits, "_", "-", "."; a letter or digit first; never
//              "Guest-..."), and, when that name is taken, the first free one with a number
//              after it. Only an offer: the member may change it before the account is made.
// ============================================================

import {
  USERNAME_MAX,
  USERNAME_MIN,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';

// The Discord name made to fit (not yet checked for being free).
export function fitUsername(discordName) {
  let name = String(discordName ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .replace(/^[^A-Za-z0-9]+/, '');
  if (name.toLowerCase().startsWith('guest-')) name = `member-${name.slice(6)}`;
  name = name.slice(0, USERNAME_MAX);
  if (name.length < USERNAME_MIN) name = `member${name}`.slice(0, USERNAME_MAX);
  return name;
}

const taken = (db, name) => Boolean(db.prepare('SELECT 1 FROM users WHERE username = ?').get(name));

// A free name based on the Discord name: "name", else "name2", "name3", ... (shortened so the
// number fits). Returns null in the very unlikely case that none of the first 1000 is free.
export function suggestUsername(db, discordName) {
  const base = fitUsername(discordName);
  for (let n = 1; n <= 1000; n += 1) {
    const suffix = n === 1 ? '' : String(n);
    const name = base.slice(0, USERNAME_MAX - suffix.length) + suffix;
    if (!validateUsername(name) && !taken(db, name)) return name;
  }
  return null;
}
