// ============================================================
// File:        bannerRoutes.js
// Path:        server/src/settings/bannerRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/banner (organisers and admins, with 2FA as every staff route): the "Site
//              banner" group of site settings (groups/banner.js) with their rules and current
//              values, and changing its on/off and text (ORGANISER_BANNER_KEYS) at once. The
//              link, the style and every other setting stay on Admin → Settings
//              (adminRoutes.js). The same checks (store.js) and the same audit entry per
//              changed setting (change.js) as there.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { changeSetting } from './change.js';
import { BANNER_SETTINGS } from './groups/banner.js';
import { checkSetting, listSettings } from './store.js';

// The only settings changed here, by organisers and admins alike (decided 2026-11-01).
export const ORGANISER_BANNER_KEYS = ['banner.enabled', 'banner.text'];

// The whole group is read, so the page can show the banner as it is (link and style
// included); `editable` names the settings it may change.
const answer = (db) => ({
  ok: true,
  settings: listSettings(db).filter((setting) => Object.hasOwn(BANNER_SETTINGS, setting.key)),
  editable: ORGANISER_BANNER_KEYS,
});

export function bannerSettingRoutes(db) {
  const router = express.Router();

  router.get('/', allow('organiser'), (_req, res) => {
    res.json(answer(db));
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
      if (!ORGANISER_BANNER_KEYS.includes(key)) {
        return sendError(
          res,
          403,
          'forbidden',
          "Only the banner's on/off and text are changed here; an admin changes the rest in Admin → Settings."
        );
      }
      const problem = checkSetting(db, key, value);
      if (problem) return sendError(res, 400, 'invalid_input', problem);
    }
    for (const [key, value] of entries) changeSetting(db, req.user, key, value);
    res.json(answer(db));
  });

  return router;
}
