// ============================================================
// File:        userRoutes.js
// Path:        server/src/admin/userRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/users (admins only): list/search, change role, grant/revoke "can
//              start games", lock/unlock, reset password. Each change writes exactly one audit
//              entry; a password reset ends all of that user's sessions (epoch bump). Role,
//              lock and password changes close that user's chat sockets (chat/hub.js).
// ============================================================

import express from 'express';
import { ROLES, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { hashPassword } from '../accounts/passwords.js';
import {
  LastAdminError,
  listUsers,
  setCanStartGames,
  setLocked,
  setRole,
} from '../accounts/userAdmin.js';
import { findUserById, setPasswordHash } from '../accounts/userStore.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { sendError } from '../http/errors.js';
import { validBody } from '../http/validate.js';

const isBoolean = (label) => (value) =>
  typeof value === 'boolean' ? null : `${label} must be true or false.`;

export function adminUserRoutes(db, config, hub) {
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
    res.json({ ok: true, users: listUsers(db, { search }) });
  });

  router.post('/:id/role', allow('admin'), loadTarget, (req, res) => {
    const input = validBody(req, res, {
      role: (v) => (ROLES.includes(v) ? null : `Role must be one of: ${ROLES.join(', ')}.`),
    });
    if (!input) return;
    const before = { role: req.target.role };
    if (!guarded(res, () => setRole(db, req.target, input.role))) return;
    hub.disconnectUser(req.target.id);
    audit(req, 'user.role', before, { role: input.role });
    res.json({ ok: true });
  });

  router.post('/:id/can-start-games', allow('admin'), loadTarget, (req, res) => {
    const input = validBody(req, res, { value: isBoolean('value') });
    if (!input) return;
    setCanStartGames(db, req.target, input.value);
    audit(
      req,
      'user.can_start_games',
      { canStartGames: req.target.canStartGames },
      { canStartGames: input.value }
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
    hub.disconnectUser(req.target.id);
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

  // The admin chooses the new password and passes it on; it is never logged or audited.
  router.post('/:id/password', allow('admin'), loadTarget, async (req, res) => {
    const input = validBody(req, res, { newPassword: validatePassword });
    if (!input) return;
    setPasswordHash(db, req.target.id, await hashPassword(input.newPassword, config.bcryptCost));
    hub.disconnectUser(req.target.id);
    audit(req, 'user.password_reset', null, { sessionsEnded: true });
    res.json({ ok: true });
  });

  return router;
}
