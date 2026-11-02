// ============================================================
// File:        index.js
// Path:        server/src/discord/index.js
// Project:     Seasonal Entertainment
// Description: The Discord area's handle (docs/AUTH.md, "Discord"), built once by app.js, or
//              null while Discord is not set up (config.discord): its routes under
//              /api/auth/discord, the daily role read (refresh.js), what the account page shows
//              about the link (accountView), and revoking an account's token at Discord when the
//              account is deleted. fetchImpl: the global fetch, or the tests' pretend Discord.
//              chatSessions.stepsChanged: open chat connections re-check their rooms.
// ============================================================

import { discordApi } from './api.js';
import { startDailyRefresh } from './refresh.js';
import { discordRoutes } from './routes.js';
import { shownSteps, stepsOfUser } from './steps.js';
import { findLink, sealedTokenOf } from './store.js';
import { openToken } from './tokenBox.js';

export function createDiscord(db, config, { fetchImpl, chatSessions }) {
  if (!config.discord) return null;
  const handle = {
    config: config.discord,
    api: discordApi(config.discord, fetchImpl),
    key: config.secretKey,
    onChange: (userId) => chatSessions.stepsChanged(userId),
  };
  return {
    ...handle,
    routes: () => discordRoutes(db, config, handle),
    // The daily read, while background jobs run (not in tests). Returns stop() or null.
    start: (log) =>
      config.backgroundJobs
        ? startDailyRefresh(db, handle, { onChange: handle.onChange, log })
        : null,
    // Before an account is deleted (accounts/deletion.js): reads its sealed token now, while the
    // link still exists, and returns what revokes it at Discord once the deletion committed
    // (best effort, in the background; nothing to do without a token).
    revokerFor(userId) {
      const sealed = sealedTokenOf(db, userId);
      if (!sealed) return () => {};
      return () =>
        openToken(sealed, handle.key)
          .then((token) => token && handle.api.revoke(token, 'refresh_token'))
          .catch(() => {});
    },
  };
}

// What the account page and the session answer show about an account's Discord link: null
// without one; otherwise its Discord name, its state (member, not_member, needs_login), when the
// roles were last read, and the steps shown now (none unless state is member). urlOf: the chat
// handle's media address (chat.images.url), for the icons.
export function accountView(db, userId, urlOf) {
  const link = findLink(db, userId);
  if (!link) return null;
  return {
    name: link.discordName,
    status: link.status,
    refreshedAt: link.refreshedAt,
    steps: shownSteps(stepsOfUser(db, userId), urlOf),
  };
}
