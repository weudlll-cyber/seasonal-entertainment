// ============================================================
// File:        bannerRoutes.js
// Path:        server/src/settings/bannerRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/banner (organisers and admins, with 2FA as every staff route): the "Site
//              banner" group of site settings (groups/banner.js) with their rules and current
//              values, and changing several of them at once. Only that group: every other
//              setting stays on Admin → Settings (adminRoutes.js). The same checks (store.js)
//              and the same audit entry per changed setting (change.js) as there.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { changeSetting } from './change.js';
import { BANNER_SETTINGS } from './groups/banner.js';
import { checkSetting, listSettings } from './store.js';

const isBannerKey = (key) => Object.hasOwn(BANNER_SETTINGS, key);
const bannerSettings = (db) => listSettings(db).filter((setting) => isBannerKey(setting.key));

export function bannerSettingRoutes(db) {
  const router = express.Router();

  router.get('/', allow('organiser'), (_req, res) => {
    res.json({ ok: true, settings: bannerSettings(db) });
  });

  // { values: { key: value, ... } }: every value is checked before any is stored, so a bad
  // text never leaves the banner switched on with the old one.
  router.put('/', allow('organiser'), (req, res) => {
    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return sendError(res, 400, 'invalid_input', 'Send the banner values to change.');
    }
    const entries = Object.entries(values);
    if (entries.length === 0) return sendError(res, 400, 'invalid_input', 'Nothing to change.');
    for (const [key, value] of entries) {
      if (!isBannerKey(key)) {
        return sendError(res, 403, 'forbidden', 'Only the site banner can be changed here.');
      }
      const problem = checkSetting(db, key, value);
      if (problem) return sendError(res, 400, 'invalid_input', problem);
    }
    for (const [key, value] of entries) changeSetting(db, req.user, key, value);
    res.json({ ok: true, settings: bannerSettings(db) });
  });

  return router;
}
