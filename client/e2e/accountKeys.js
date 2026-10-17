// ============================================================
// File:        accountKeys.js
// Path:        client/e2e/accountKeys.js
// Project:     Seasonal Entertainment
// Description: For specs and the global setup that create accounts through the API instead of
//              the pages: the registration body a browser sends (a random salt and the auth key
//              derived from the password with the project's crypto helper, docs/AUTH.md), and
//              the auth key that proves an existing account's password.
// ============================================================

import { deriveAccountKeys, newSalt } from '@seasonal-entertainment/shared/crypto.js';

export async function newAccountData(username, password, extra = {}) {
  const salt = await newSalt();
  const { authKey } = await deriveAccountKeys(password, salt);
  return {
    username,
    email: `${username}@example.org`,
    salt,
    authKey,
    ageConfirmed: true,
    ...extra,
  };
}

// api: a Playwright request context; the salt comes from the pre-login step, as in a browser.
export async function authKeyFor(api, username, password) {
  const pre = await api.post('/api/auth/prelogin', { data: { username } });
  const { salt } = await pre.json();
  return (await deriveAccountKeys(password, salt)).authKey;
}
