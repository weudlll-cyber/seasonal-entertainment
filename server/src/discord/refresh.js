// ============================================================
// File:        refresh.js
// Path:        server/src/discord/refresh.js
// Project:     Seasonal Entertainment
// Description: Reading a member's roles on the Seasonal Tokens server (docs/AUTH.md,
//              "Discord: roles and the daily read"). storeRead: after a Discord login or link,
//              the tokens just given and the member record read with them are stored together.
//              refreshLink: the daily read without the member: claim the link (one refresh per
//              account at a time), trade the refresh token for new ones (Discord rotates: the old
//              one dies at once), store the new token at once (keepRefreshToken), then read the
//              member record and store the roles, each into the claimed link only (an unlink or
//              deletion meanwhile wins, and the new token is revoked). Only a stop between
//              Discord's answer and that first statement loses the token (the member then logs
//              in with Discord again; docs/AUTH.md). invalid_grant: the link
//              needs a Discord login (steps hidden); 404 code 10004: not on the server (no
//              steps); rate limited or Discord down: the old token still works, try later. The
//              daily job reads due links one after another, a few seconds apart, well inside
//              Discord's per-user limit (a burst of 5, then one a minute) and its global one.
//              onChange(userId): the roles changed, so open chat connections re-check rooms.
//              Each tick also revokes held sign-ups that timed out unseen (droppedGrants.js).
// ============================================================

import { DiscordError } from './api.js';
import { sweepSignups } from './droppedGrants.js';
import {
  claimRefresh,
  dueLinks,
  findLink,
  keepRefreshToken,
  markNeedsLogin,
  releaseClaim,
  saveRead,
  saveRefreshed,
} from './store.js';
import { openToken, sealToken } from './tokenBox.js';

const RETRY_MS = 60 * 60_000; // Discord down or busy: the next try an hour later
const TICK_MS = 60_000; // the job looks for due links every minute
const PER_TICK = 10; // at most this many reads per minute
const GAP_MS = 3000; // between two reads

const sameRoles = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

// The member record read with a fresh access token: { status, roleIds }.
async function readMember(api, accessToken) {
  try {
    return { status: 'member', roleIds: await api.memberRoles(accessToken) };
  } catch (err) {
    if (err instanceof DiscordError && err.kind === 'not_member') {
      return { status: 'not_member', roleIds: [] };
    }
    throw err;
  }
}

// discord: { api, key } (discord/routes.js builds it). tokens: from a login or link that just
// happened; discordUser: { id, username }. Returns the stored { status, roleIds }.
export async function storeRead(db, discord, userId, discordUser, tokens) {
  let member;
  try {
    member = await readMember(discord.api, tokens.accessToken);
  } catch {
    // Discord busy or down: the login still counts; the roles known so far stay (none for a
    // new link) and the daily read tries again.
    const known = findLink(db, userId);
    member =
      known?.status === 'not_member'
        ? { status: 'not_member', roleIds: [] }
        : { status: 'member', roleIds: known?.roleIds ?? [] };
  }
  saveRead(db, userId, {
    discordId: discordUser.id,
    discordName: discordUser.username,
    sealedToken: await sealToken(tokens.refreshToken, discord.key),
    ...member,
  });
  return member;
}

// The daily read for one account. Returns 'done', 'busy' (claimed elsewhere or no token),
// 'needs_login', 'later' or 'gone' (the link was removed while Discord answered; the new token
// is revoked).
export async function refreshLink(db, discord, userId, { onChange = () => {} } = {}) {
  const sealed = claimRefresh(db, userId);
  if (!sealed) return 'busy';
  const before = findLink(db, userId);
  const refreshToken = await openToken(sealed, discord.key);
  if (!refreshToken) {
    markNeedsLogin(db, userId);
    onChange(userId);
    return 'needs_login';
  }
  let tokens;
  try {
    tokens = await discord.api.refresh(refreshToken);
  } catch (err) {
    if (err instanceof DiscordError && err.kind === 'invalid_grant') {
      markNeedsLogin(db, userId);
      onChange(userId);
      return 'needs_login';
    }
    const wait = err instanceof DiscordError && err.retryAfterMs ? err.retryAfterMs : RETRY_MS;
    releaseClaim(db, userId, Date.now() + wait);
    return 'later';
  }
  // Unlinked or deleted while Discord answered: the new grant must not outlive the link.
  const gone = async () => {
    await discord.api.revoke(tokens.refreshToken, 'refresh_token');
    return 'gone';
  };
  // From here the old token is dead: the new one is stored before anything else is asked.
  const sealedToken = await sealToken(tokens.refreshToken, discord.key);
  if (!keepRefreshToken(db, userId, sealedToken)) return gone();
  let member;
  try {
    member = await readMember(discord.api, tokens.accessToken);
  } catch {
    member = { status: before.status, roleIds: before.roleIds }; // keep what was known
  }
  if (!saveRefreshed(db, userId, { sealedToken, ...member })) return gone();
  if (member.status !== before.status || !sameRoles(member.roleIds, before.roleIds)) {
    onChange(userId);
  }
  return 'done';
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One round of the daily job: up to PER_TICK due links, one after another, gapMs apart.
// isStopped(): the job was stopped meanwhile. Returns how many were read.
export async function refreshDue(
  db,
  discord,
  { onChange, gapMs = GAP_MS, isStopped = () => false } = {}
) {
  let read = 0;
  for (const userId of dueLinks(db, Date.now(), PER_TICK)) {
    if (isStopped()) break;
    await refreshLink(db, discord, userId, { onChange });
    read += 1;
    if (gapMs) await pause(gapMs);
  }
  return read;
}

// The daily job: a round every minute (never two at once). Returns stop().
export function startDailyRefresh(db, discord, { onChange, log = console.warn } = {}) {
  let running = false;
  let stopped = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await sweepSignups(db, discord);
      await refreshDue(db, discord, { onChange, isStopped: () => stopped });
    } catch (err) {
      log(`[discord] daily role read failed: ${err.message}`);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
