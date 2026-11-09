// ============================================================
// File:        routes.js
// Path:        server/src/discord/routes.js
// Project:     Seasonal Entertainment
// Description: /api/auth/discord (docs/AUTH.md, "Discord"), mounted only when Discord is set up:
//              - POST /link: "prove it is you" before linking (the password's auth key, or for an
//                account without one a fresh Discord proof; accounts/identityProof.js): marks the
//                session for one link within LINK_PROOF_MS. A taken-over session alone cannot
//                link another Discord user, which would outlive a password change;
//              - GET /start?intent=login|link|confirm&next=: a fresh state and PKCE verifier in
//                the session, then off to Discord's consent page (scopes identify and
//                guilds.members.read only); a link only with that mark;
//              - GET /callback: the state must match (once, within 10 minutes); the code is
//                traded for tokens; then, by intent: log in the linked account (the same rules
//                as a password login: locked, the staff 2FA step), or hold a sign-up for
//                /register/discord; link to the signed-in account (a Discord user linked
//                elsewhere is refused; the mark checked again and used up); or confirm it is the account's own Discord user (the
//                proof accounts without a password give, accounts/identityProof.js). Every
//                login and link reads the roles with the tokens just given (refresh.js).
//                Failures go back to the page with ?discord=<reason> and count on the login's
//                per-IP limit;
//              - GET /signup and POST /register: the sign-up's offered name, then the account
//                (the chosen name and the age confirmation; no email, no password), with the
//                sign-up claimed from the session row first, so the sweep cannot revoke it;
//              - DELETE /: unlink (only with a password to log in with afterwards; proven with
//                it), the token revoked at Discord.
//              A fresh grant that is not kept (already logged in, registration closed, a link
//              refused, a sign-up replaced or timed out) is revoked (droppedGrants.js).
//              Tokens and the client secret never reach the browser or a log.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { MINIMUM_AGE, validateUsername } from '@seasonal-entertainment/shared/accountRules.js';
import { localPathOr } from '@seasonal-entertainment/shared/localPath.js';
import { authKeyField } from '../accounts/credentials.js';
import { provesIdentity } from '../accounts/identityProof.js';
import { DuplicateAccountError, createUser, findUserById } from '../accounts/userStore.js';
import { selfOrigin } from '../http/csrf.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { startSession } from '../http/session.js';
import { mustBeTrue, validBody } from '../http/validate.js';
import { getSetting } from '../settings/store.js';
import { beginSecondFactor } from '../twofa/routes.js';
import { isTwoFactorEnabled } from '../twofa/store.js';
import { CALLBACK_PATH } from './config.js';
import { claimSignup, dropGrant, dropSignup, signupExpired } from './droppedGrants.js';
import { storeRead } from './refresh.js';
import { DiscordTakenError, deleteLink, findLink, findLinkByDiscordId, saveRead } from './store.js';
import { openToken, sealToken } from './tokenBox.js';
import { suggestUsername } from './username.js';

const FLOW_MS = 10 * 60_000; // from /start to the callback
const LINK_PROOF_MS = FLOW_MS; // from POST /link to the callback that links
const INTENTS = new Set(['login', 'link', 'confirm']);

// Only local paths (the browser's safeNext uses the same rule): never "//host" or a full URL.
const safeNext = localPathOr;

const sameText = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

const freshLinkProof = (session) =>
  typeof session?.discordLinkProofAt === 'number' &&
  Date.now() - session.discordLinkProofAt < LINK_PROOF_MS;

const saved = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

// discord: the area's handle (discord/index.js): { config, api, key, onChange }; onChange(userId)
// lets open chat connections re-check their rooms after the steps may have changed.
export function discordRoutes(db, appConfig, discord) {
  const router = express.Router();
  const limits = appConfig.rateLimits;
  const startsPerIp = makeLimiter(limits.prelogin);
  // A failed callback (wrong state, refused code) counts like a failed password login.
  const failuresPerIp = makeLimiter(limits.login, {
    failedOnly: true,
    succeeded: (_req, res) => !res.locals.discordFailed,
    onLimit: (_req, res) => res.redirect('/login?discord=too_many'),
  });
  const registerLimiter = makeLimiter(limits.register);
  const perUser = makeLimiter(limits.passwordChange, {
    failedOnly: true,
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  const redirectUri = (req) =>
    discord.config.redirectUri ?? `${selfOrigin(req, appConfig)}${CALLBACK_PATH}`;

  // Before a link: the same proof as the other sensitive changes.
  router.post('/link', allow('member'), perUser, async (req, res) => {
    const input = req.user.hasPassword
      ? validBody(req, res, { authKey: authKeyField('Password') })
      : {};
    if (!input) return;
    if (!(await provesIdentity(db, appConfig, req, res, input.authKey))) return;
    req.session.discordLinkProofAt = Date.now();
    await saved(req);
    res.json({ ok: true });
  });

  router.get('/start', allow('public'), startsPerIp, async (req, res) => {
    const intent = INTENTS.has(req.query.intent) ? req.query.intent : 'login';
    const next = safeNext(req.query.next, '/account');
    // Linking and confirming are for the signed-in account only.
    if (intent !== 'login' && !req.user) {
      return res.redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    if (intent === 'link' && !freshLinkProof(req.session)) {
      return back(res, '/account', 'proof_required', { counted: false });
    }
    const state = randomBytes(16).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const uri = redirectUri(req);
    req.session.discordFlow = {
      state,
      verifier,
      intent,
      next,
      redirectUri: uri,
      userId: req.user?.id ?? null,
      at: Date.now(),
    };
    await saved(req);
    const url = new URL(discord.config.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: discord.config.clientId,
      scope: discord.config.scopes,
      redirect_uri: uri,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      // Skips the consent page for someone who already agreed to these scopes.
      prompt: 'none',
    }).toString();
    res.redirect(url.href);
  });

  // Back to `page` with ?discord=<reason>; counted as a failure unless `counted` is false.
  function back(res, page, reason, { counted = true } = {}) {
    if (counted) res.locals.discordFailed = true;
    const url = new URL(page, 'http://x');
    url.searchParams.set('discord', reason);
    res.redirect(`${url.pathname}${url.search}`);
  }

  async function logIn(req, res, flow, discordUser, tokens) {
    const link = findLinkByDiscordId(db, discordUser.id);
    if (!link) return holdSignup(req, res, flow, discordUser, tokens);
    const user = findUserById(db, link.userId);
    if (user.locked) return back(res, '/login', 'locked');
    await storeRead(db, discord, user.id, discordUser, tokens);
    discord.onChange(user.id);
    if (isTwoFactorEnabled(db, user.id)) {
      // The staff gate is unchanged: the second step as after a password (twofa/routes.js).
      await beginSecondFactor(req, user);
      return res.redirect(`/login?discord=2fa&next=${encodeURIComponent(flow.next)}`);
    }
    await startSession(req, user);
    req.session.discordProofAt = Date.now();
    await saved(req);
    res.redirect(flow.next);
  }

  // No account has this Discord user: the sign-up waits in the session (the refresh token
  // sealed) until a name is chosen.
  async function holdSignup(req, res, flow, discordUser, tokens) {
    if (!getSetting(db, 'accounts.registrationOpen')) {
      await dropGrant(db, discord, discordUser.id, tokens.refreshToken);
      return back(res, '/login', 'closed');
    }
    // A sign-up held for another Discord user is given up. One for the same user is not
    // revoked: that would end the grant just given too.
    const earlier = req.session.discordSignup;
    if (earlier && earlier.discordId !== discordUser.id) await dropSignup(db, discord, earlier);
    let member;
    try {
      member = { status: 'member', roleIds: await discord.api.memberRoles(tokens.accessToken) };
    } catch (err) {
      member = { status: err.kind === 'not_member' ? 'not_member' : 'member', roleIds: [] };
    }
    req.session.discordSignup = {
      discordId: discordUser.id,
      discordName: discordUser.username,
      sealedToken: await sealToken(tokens.refreshToken, discord.key),
      ...member,
      next: flow.next,
      at: Date.now(),
    };
    await saved(req);
    res.redirect(`/register/discord?next=${encodeURIComponent(flow.next)}`);
  }

  async function linkOrConfirm(req, res, flow, discordUser, tokens) {
    const user = req.user;
    if (flow.intent === 'link') {
      // Checked again: the proof may have run out, or been used, since /start.
      const proven = freshLinkProof(req.session);
      delete req.session.discordLinkProofAt; // one link per proof
      if (!proven) {
        await saved(req);
        await dropGrant(db, discord, discordUser.id, tokens.refreshToken);
        return back(res, '/account', 'proof_required');
      }
    }
    const own = findLink(db, user.id);
    const elsewhere = findLinkByDiscordId(db, discordUser.id);
    if (elsewhere && elsewhere.userId !== user.id) return back(res, '/account', 'taken');
    const refused =
      (own && own.discordId !== discordUser.id && 'other_user') ||
      (flow.intent === 'confirm' && !own && 'not_linked');
    if (refused) {
      await dropGrant(db, discord, discordUser.id, tokens.refreshToken);
      return back(res, '/account', refused);
    }
    try {
      await storeRead(db, discord, user.id, discordUser, tokens);
    } catch (err) {
      if (!(err instanceof DiscordTakenError)) throw err;
      return back(res, '/account', 'taken');
    }
    discord.onChange(user.id);
    req.session.discordProofAt = Date.now();
    await saved(req);
    if (flow.intent === 'link') return back(res, '/account', 'linked', { counted: false });
    res.redirect(flow.next);
  }

  router.get('/callback', allow('public'), failuresPerIp, async (req, res) => {
    const flow = req.session?.discordFlow;
    if (flow) {
      delete req.session.discordFlow; // once only
      await saved(req);
    }
    const fallback = flow?.intent === 'login' || !flow ? '/login' : '/account';
    if (!flow || Date.now() - flow.at > FLOW_MS || !sameText(req.query.state, flow.state)) {
      return back(res, fallback, 'expired');
    }
    // The flow belongs to whoever started it: a different (or no) account now is refused.
    if (flow.intent !== 'login' && req.user?.id !== flow.userId) {
      return back(res, '/login', 'expired');
    }
    if (req.query.error) return back(res, fallback, 'denied', { counted: false });
    if (typeof req.query.code !== 'string') return back(res, fallback, 'failed');
    let tokens;
    let discordUser;
    try {
      tokens = await discord.api.exchangeCode(req.query.code, flow.verifier, flow.redirectUri);
      discordUser = await discord.api.user(tokens.accessToken);
    } catch {
      return back(res, fallback, 'failed');
    }
    if (flow.intent === 'login') {
      if (req.user) {
        await dropGrant(db, discord, discordUser.id, tokens.refreshToken);
        return res.redirect(flow.next);
      }
      return logIn(req, res, flow, discordUser, tokens);
    }
    return linkOrConfirm(req, res, flow, discordUser, tokens);
  });

  // The waiting sign-up, or null when there is none. One that is too old leaves the session and
  // its grant is revoked.
  async function signupOf(req) {
    const signup = req.session?.discordSignup;
    if (!signup || !signupExpired(signup)) return signup ?? null;
    delete req.session.discordSignup;
    await saved(req);
    await dropSignup(db, discord, signup);
    return null;
  }

  router.get('/signup', allow('public'), async (req, res) => {
    const signup = await signupOf(req);
    if (!signup) return sendError(res, 404, 'not_found', 'No Discord sign-up is waiting.');
    res.json({
      ok: true,
      discordName: signup.discordName,
      suggested: suggestUsername(db, signup.discordName),
    });
  });

  router.post('/register', allow('public'), registerLimiter, async (req, res) => {
    if (!getSetting(db, 'accounts.registrationOpen')) {
      return sendError(res, 403, 'registration_closed', 'Registration is closed at the moment.');
    }
    const signup = await signupOf(req);
    if (!signup) {
      return sendError(res, 409, 'signup_expired', 'Please start again with Discord.');
    }
    const input = validBody(req, res, {
      username: validateUsername,
      ageConfirmed: mustBeTrue(`Please confirm that you are at least ${MINIMUM_AGE} years old.`),
    });
    if (!input) return;
    if (findLinkByDiscordId(db, signup.discordId)) {
      return sendError(res, 409, 'discord_taken', 'This Discord account is already linked.');
    }
    let user;
    try {
      // The account and its link together, or neither; and only with the sign-up claimed from
      // the session row, so the sweep cannot be revoking this grant (droppedGrants.js).
      user = db.transaction(() => {
        if (!claimSignup(db, req.sessionID, signup)) return null;
        const created = createUser(db, {
          username: input.username,
          email: null,
          passwordHash: null,
          kdfSalt: null,
        });
        saveRead(db, created.id, {
          discordId: signup.discordId,
          discordName: signup.discordName,
          sealedToken: signup.sealedToken,
          status: signup.status,
          roleIds: signup.roleIds,
        });
        return created;
      })();
    } catch (err) {
      if (err instanceof DuplicateAccountError) {
        return sendError(res, 409, 'username_taken', 'This username is already registered.');
      }
      if (err instanceof DiscordTakenError) {
        return sendError(res, 409, 'discord_taken', 'This Discord account is already linked.');
      }
      throw err;
    }
    if (!user) {
      // The sweep took it (or it timed out just now): this copy must not be saved back.
      delete req.session.discordSignup;
      await saved(req);
      return sendError(res, 409, 'signup_expired', 'Please start again with Discord.');
    }
    await startSession(req, user);
    // The Discord login just happened: it counts as the proof for the first key setup.
    req.session.discordProofAt = signup.at;
    await saved(req);
    res.status(201).json({ ok: true, userId: user.id });
  });

  // Unlinking: only an account with a password (it could not log in otherwise), proven with it.
  router.delete('/', allow('member'), perUser, async (req, res) => {
    if (!req.user.hasPassword) {
      return sendError(
        res,
        409,
        'password_required',
        'Set a password first: without Discord, it is how you log in.'
      );
    }
    const input = validBody(req, res, { authKey: authKeyField('Password') });
    if (!input) return;
    if (!(await provesIdentity(db, appConfig, req, res, input.authKey))) return;
    // Nothing linked gives the same answer: there is simply nothing to revoke.
    const sealed = deleteLink(db, req.user.id);
    const token = sealed && (await openToken(sealed, discord.key));
    // Revoking the refresh token ends the whole grant at Discord.
    if (token) await discord.api.revoke(token, 'refresh_token');
    discord.onChange(req.user.id);
    res.json({ ok: true });
  });

  return router;
}
