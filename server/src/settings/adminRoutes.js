// ============================================================
// File:        adminRoutes.js
// Path:        server/src/settings/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/settings (admins only): every site setting with its current value,
//              and changing one. Each change writes one audit entry.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { SETTINGS } from './definitions.js';
import { getSetting, listSettings, setSetting } from './store.js';

export function adminSettingRoutes(db) {
  const router = express.Router();

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, settings: listSettings(db) });
  });

  router.put('/:key', allow('admin'), (req, res) => {
    const definition = SETTINGS[req.params.key];
    if (!definition) return sendError(res, 404, 'not_found', 'No such setting.');
    const { value } = req.body ?? {};
    if (!Number.isInteger(value) || value < definition.min || value > definition.max) {
      return sendError(
        res,
        400,
        'invalid_input',
        `${definition.label} must be a whole number from ${definition.min} to ${definition.max}.`
      );
    }
    const before = getSetting(db, req.params.key);
    setSetting(db, req.params.key, value);
    recordAudit(db, req.user, {
      action: 'setting.change',
      targetType: 'setting',
      targetId: req.params.key,
      before: { value: before },
      after: { value },
    });
    res.json({ ok: true, settings: listSettings(db) });
  });

  return router;
}
