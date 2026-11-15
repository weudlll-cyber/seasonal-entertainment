// ============================================================
// File:        routes.js
// Path:        server/src/alerts/routes.js
// Project:     Seasonal Entertainment
// Description: The outage e-mails on the site's side (docs/DEPLOYMENT.md, "An e-mail when the
//              site is down"; decided 2026-11-14), admins only:
//              - GET /api/admin/outage-alert: how the last "Send a test e-mail" went.
//              - POST /api/admin/outage-alert/test: asks the host's watchdog for a test e-mail
//                to the saved address (audited alerts.test_mail); it goes out on the
//                watchdog's next run, within 2 minutes.
//              The recipient file follows the "Outage alert address" setting: written when the
//              app starts (so a restored database is followed at once) and on every change
//              (outageAddressChanged, called by the settings route).
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { OUTAGE_ADDRESS } from '../settings/groups/alerts.js';
import { getSetting } from '../settings/store.js';
import { requestTestMail, testMailState, writeOutageAddress } from './outageFiles.js';

// For the settings route (settings/adminRoutes.js): after a setting changed.
export const outageAddressChanged = (config) => (key, value) => {
  if (key === OUTAGE_ADDRESS) writeOutageAddress(config, value);
};

export function outageAlertRoutes(db, config) {
  const router = express.Router();
  writeOutageAddress(config, getSetting(db, OUTAGE_ADDRESS));

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, test: testMailState(config) });
  });

  router.post('/test', allow('admin'), (req, res) => {
    const to = getSetting(db, OUTAGE_ADDRESS);
    if (!to) {
      return sendError(res, 400, 'no_address', 'Save an outage alert address first.');
    }
    const requestedAt = requestTestMail(config);
    recordAudit(db, req.user, {
      action: 'alerts.test_mail',
      targetType: 'setting',
      targetId: OUTAGE_ADDRESS,
    });
    res.json({ ok: true, test: testMailState(config), requestedAt });
  });

  return router;
}
