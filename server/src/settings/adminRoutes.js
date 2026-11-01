// ============================================================
// File:        adminRoutes.js
// Path:        server/src/settings/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/settings (admins only, with 2FA as every admin route): every site
//              setting with its group, rules and current value, and changing one after its
//              kind's check (types.js). Each change writes one audit entry with the old and
//              new value (change.js). Organisers change the site banner on their own route
//              (bannerRoutes.js).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { changeSetting } from './change.js';
import { GROUPS, SETTINGS } from './definitions.js';
import { checkSetting, listSettings } from './store.js';

export function adminSettingRoutes(db) {
  const router = express.Router();

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, groups: GROUPS, settings: listSettings(db) });
  });

  router.put('/:key', allow('admin'), (req, res) => {
    if (!SETTINGS[req.params.key]) return sendError(res, 404, 'not_found', 'No such setting.');
    const { value } = req.body ?? {};
    const problem = checkSetting(db, req.params.key, value);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    changeSetting(db, req.user, req.params.key, value);
    res.json({ ok: true, groups: GROUPS, settings: listSettings(db) });
  });

  return router;
}
