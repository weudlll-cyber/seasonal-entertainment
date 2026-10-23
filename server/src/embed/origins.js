// ============================================================
// File:        origins.js
// Path:        server/src/embed/origins.js
// Project:     Seasonal Entertainment
// Description: The foreign sites an admin approved for the embedded chat (owner decision
//              2026-10-19): exact https origins, no wildcards, no paths. Stored as one site
//              setting (settings/store.js, key "embed.allowedOrigins", a JSON list), held in
//              memory and replaced on every change, so the CSP of /embed/* (http/
//              securityHeaders.js) and every embed token check read the list without a query.
//              Each site's own rules (2026-10-23): for every rule in SITE_RULES, "inherit" (the
//              "Other sites" setting), "on" or "off", stored the same way ("embed.siteRules", a
//              JSON object by origin) and gone with the site.
// ============================================================

import { getSetting, getTextSetting, setSetting } from '../settings/store.js';

const KEY = 'embed.allowedOrigins';
const RULES_KEY = 'embed.siteRules';
// What a site may override; each is also a global setting "embed.<rule>" (settings/groups/).
export const SITE_RULES = ['guestsRead', 'guestsWrite'];
export const RULE_VALUES = ['inherit', 'on', 'off'];

// Development only: these hosts may be approved over plain http, to try a foreign site on one
// machine (e.g. a page on http://[::1]:5380 framing http://localhost:5380; docs/EMBED.md).
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// An admin's input as an origin: { origin } normalised (lower-case host, no default port),
// or { error } saying what is wrong with it. allowLocalHttp: outside production only.
export function normaliseOrigin(input, { allowLocalHttp = false } = {}) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text.includes('*')) return { error: 'Wildcards are not allowed: name one exact site.' };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'Enter a site address such as https://example.org.' };
  }
  const localHttp = allowLocalHttp && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    return { error: 'Only https:// sites can be approved.' };
  }
  if (url.username || url.password)
    return { error: 'An address with a login part is not allowed.' };
  // Only the origin: a path, query or fragment would suggest a narrower approval than it is.
  if (url.pathname !== '/' || url.search || url.hash || !/^https?:\/\/[^/]+\/?$/i.test(text)) {
    return { error: 'Only the site itself: no path, query or #part.' };
  }
  return { origin: url.origin };
}

// { list, allows, add, remove, rulesOf, rule, setRule } over the stored list and rules.
export function createEmbedOrigins(db) {
  let cached = null;
  let cachedRules = null;
  const read = () => {
    cached ??= Object.freeze(JSON.parse(getTextSetting(db, KEY) ?? '[]'));
    return cached;
  };
  const write = (list) => {
    setSetting(db, KEY, JSON.stringify(list));
    cached = null; // the next read (a CSP header, a token check) sees the change
  };
  const readRules = () => (cachedRules ??= JSON.parse(getTextSetting(db, RULES_KEY) ?? '{}'));
  const writeRules = (all) => {
    setSetting(db, RULES_KEY, JSON.stringify(all));
    cachedRules = null;
  };
  // Without the site's own override, its rules are "inherit".
  const rulesOf = (origin) => ({
    ...Object.fromEntries(SITE_RULES.map((rule) => [rule, 'inherit'])),
    ...readRules()[origin],
  });
  return {
    list: read,
    allows: (origin) => read().includes(origin),
    // true when added now, false when it was there already.
    add(origin) {
      if (read().includes(origin)) return false;
      write([...read(), origin].sort());
      return true;
    },
    remove(origin) {
      if (!read().includes(origin)) return false;
      write(read().filter((o) => o !== origin));
      const { [origin]: _gone, ...rest } = readRules(); // its rules go with it
      writeRules(rest);
      return true;
    },
    rulesOf,
    // Whether `rule` holds on that site now: its own "on" or "off", else the global setting.
    rule(origin, rule) {
      const own = rulesOf(origin)[rule];
      return own === 'inherit' ? getSetting(db, `embed.${rule}`) : own === 'on';
    },
    // value: one of RULE_VALUES; "inherit" drops the site's own value.
    setRule(origin, rule, value) {
      const { [rule]: _old, ...others } = rulesOf(origin);
      const own = Object.fromEntries(
        Object.entries({ ...others, ...(value === 'inherit' ? {} : { [rule]: value }) }).filter(
          ([, v]) => v !== 'inherit'
        )
      );
      writeRules({ ...readRules(), [origin]: own });
    },
  };
}
