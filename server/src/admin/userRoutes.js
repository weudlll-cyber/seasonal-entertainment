// ============================================================
// File:        userRoutes.js
// Path:        server/src/admin/userRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/users (admins only): list/search (with the embedded games, whose
//              hosting is granted per account: accounts/gameHosts.js), change role, grant/revoke
//              hosting one game (audited user.game_host with the game), lock/unlock, reset password (a new salt and auth key derived in
//              the admin's browser, docs/AUTH.md; noted for the games as "rights"), delete an account (accounts/deletion.js;
//              never the last admin, never the admin's own: that is the account page's, with
//              the password). Each change writes exactly one audit entry; a password reset
//              ends all of that user's sessions (epoch bump). Role, lock, password changes and
//              deletion close that user's chat sockets (chat/mount.js).
// ============================================================

import express from 'express';
import { ROLES } from '@seasonal-entertainment/shared/accountRules.js';
import { authKeyField, saltField } from '../accounts/credentials.js';
import { deleteAccount } from '../accounts/deletion.js';
import { hashPassword } from '../accounts/passwords.js';
import { isGame, setGameHost } from '../accounts/gameHosts.js';
import { LastAdminError, listUsers, setLocked, setRole } from '../accounts/userAdmin.js';
import { EMBEDDED_GAMES } from '../games/embedded.js';
import { noteAccountChange } from '../accounts/accountChanges.js';
import { findUserById, setPasswordHash } from '../accounts/userStore.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { sendError } from '../http/errors.js';
import { validBody } from '../http/validate.js';

const isBoolean = (label) => (value) =>
  typeof value === 'boolean' ? null : `${label} must be true or false.`;

// chat: the chat handle (chat/mount.js): its sessions interface (open sockets follow account
// changes) and its accounts interface (the chat's part of deleting an account).
// discord: the Discord handle or null (discord/index.js): a deleted account's token is revoked.
export function adminUserRoutes(
  db,
  config,
  { sessions: chatSessions, accounts: chatAccounts },
  discord
) {
  const router = express.Router();

  // Loaded after allow(): who may not use these routes cannot probe which ids exist.
  const loadTarget = loadById((id) => findUserById(db, id), 'target', 'user');

  const audit = (req, action, before, after) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'user',
      targetId: req.target.id,
      before,
      after,
    });

  // Runs a change; the last-admin rule becomes a 409 instead of a 500.
  const guarded = (res, change) => {
    try {
      change();
      return true;
    } catch (err) {
      if (!(err instanceof LastAdminError)) throw err;
      sendError(res, 409, 'last_admin', err.message);
      return false;
    }
  };

  router.get('/', allow('admin'), (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    // games: every game of the allowlist, for one hosting box each (named as the game is).
    const games = Object.entries(EMBEDDED_GAMES).map(([slug, game]) => ({ slug, name: game.name }));
    res.json({ ok: true, games, users: listUsers(db, { search }) });
  });

  router.post('/:id/role', allow('admin'), loadTarget, (req, res) => {
    const input = validBody(req, res, {
      role: (v) => (ROLES.includes(v) ? null : `Role must be one of: ${ROLES.join(', ')}.`),
    });
    if (!input) return;
    const before = { role: req.target.role };
    if (!guarded(res, () => setRole(db, req.target, input.role))) return;
    chatSessions.accountChanged(req.target.id);
    audit(req, 'user.role', before, { role: input.role });
    res.json({ ok: true });
  });

  // One game's hosting for one account; a change ends the member's game sessions ("rights").
  router.post('/:id/game-host', allow('admin'), loadTarget, (req, res) => {
    const input = validBody(req, res, {
      game: (v) => (isGame(v) ? null : 'Pick one of the embedded games.'),
      value: isBoolean('value'),
    });
    if (!input) return;
    const changed = setGameHost(db, req.target, input.game, input.value);
    audit(
      req,
      'user.game_host',
      { game: input.game, value: changed ? !input.value : input.value },
      { game: input.game, value: input.value }
    );
    res.json({ ok: true });
  });

  router.post('/:id/lock', allow('admin'), loadTarget, (req, res) => {
    const input = validBody(req, res, { locked: isBoolean('locked') });
    if (!input) return;
    if (input.locked && req.target.id === req.user.id) {
      return sendError(res, 409, 'self_lock', 'You cannot lock your own account.');
    }
    if (!guarded(res, () => setLocked(db, req.target, input.locked))) return;
    chatSessions.accountChanged(req.target.id);
    audit(
      req,
      input.locked ? 'user.lock' : 'user.unlock',
      { locked: req.target.locked },
      {
        locked: input.locked,
      }
    );
    res.json({ ok: true });
  });

  // The admin chooses the new password and passes it on; their browser derives a fresh salt and
  // auth key from it, so the password itself never reaches the server (nor any log).
  router.post('/:id/password', allow('admin'), loadTarget, async (req, res) => {
    const input = validBody(req, res, { salt: saltField, authKey: authKeyField('New password') });
    if (!input) return;
    const verifier = await hashPassword(input.authKey, config.bcryptCost);
    // As a member's own change: the games end that member's sessions too ("rights").
    db.transaction(() => {
      noteAccountChange(db, req.target.id, 'rights');
      setPasswordHash(db, req.target.id, verifier, input.salt);
    })();
    chatSessions.accountChanged(req.target.id);
    audit(req, 'user.password_reset', null, { sessionsEnded: true });
    res.json({ ok: true });
  });

  // Everything of the account goes at once (accounts/deletion.js); the audit entry keeps who
  // deleted which account name, and is written in the same transaction.
  router.delete('/:id', allow('admin'), loadTarget, (req, res) => {
    if (req.target.id === req.user.id) {
      return sendError(
        res,
        409,
        'self_delete',
        'Delete your own account on your account page, with your password.'
      );
    }
    const deleted = { username: req.target.username, role: req.target.role };
    const deletion = () =>
      deleteAccount(
        db,
        { chatAccounts, journal: config.deletionJournal, discord },
        req.target,
        () => audit(req, 'user.delete', deleted)
      );
    if (!guarded(res, deletion)) return;
    chatSessions.accountChanged(req.target.id);
    res.json({ ok: true });
  });

  return router;
}
