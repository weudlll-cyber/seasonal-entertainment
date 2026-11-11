// ============================================================
// File:        adminRoutes.js
// Path:        server/src/profiles/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: Moderating a member's profile (docs/AUTH.md, "Member profiles"; decided
//              2026-11-11): an admin clears its About me (DELETE /api/admin/users/:id/about)
//              or removes its picture (DELETE /api/admin/users/:id/picture). Each clear writes
//              one audit entry in the same transaction (user.profile_about_clear,
//              user.profile_picture_clear), naming the account, never the cleared text.
// ============================================================

import express from 'express';
import { findUserById } from '../accounts/userStore.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { deleteFiles } from './routes.js';
import { removePicture, setAbout } from './store.js';

export function adminProfileRoutes(db, config) {
  const router = express.Router();
  const loadTarget = loadById((id) => findUserById(db, id), 'target', 'account');
  const audit = (req, action) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'user',
      targetId: req.target.id,
      before: { username: req.target.username },
    });

  router.delete('/:id/about', allow('admin'), loadTarget, (req, res) => {
    db.transaction(() => {
      setAbout(db, req.target.id, '');
      audit(req, 'user.profile_about_clear');
    })();
    res.json({ ok: true });
  });

  router.delete('/:id/picture', allow('admin'), loadTarget, (req, res) => {
    const files = db.transaction(() => {
      const removed = removePicture(db, req.target.id);
      audit(req, 'user.profile_picture_clear');
      return removed;
    })();
    deleteFiles(config, files);
    res.json({ ok: true });
  });

  return router;
}
