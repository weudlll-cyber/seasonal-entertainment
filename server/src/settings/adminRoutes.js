// ============================================================
// File:        adminRoutes.js
// Path:        server/src/settings/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/settings (admins only, with 2FA as every admin route): every site
//              setting with its group, rules and current value, and changing one after its
//              kind's check (types.js). Each change writes one audit entry with the old and
//              new value.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { GROUPS, SETTINGS } from './definitions.js';
import { checkSetting, getSetting, listSettings, setSetting } from './store.js';

export function adminSettingRoutes(db) {
  const router = express.Router();

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, groups: GROUPS, settings: listSettings(db) });
  });

  router.put('/:key', allow('admin'), (req, res) => {
    if (!SETTINGS[req.params.key]) return sendError(res, 404, 'not_found', 'No such setting.');
    const { value } = req.body ?? {};
    const problem = checkSetting(req.params.key, value);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    const before = getSetting(db, req.params.key);
    setSetting(db, req.params.key, value);
    recordAudit(db, req.user, {
      action: 'setting.change',
      targetType: 'setting',
      targetId: req.params.key,
      before: { value: before },
      after: { value },
    });
    res.json({ ok: true, groups: GROUPS, settings: listSettings(db) });
  });

  return router;
}
