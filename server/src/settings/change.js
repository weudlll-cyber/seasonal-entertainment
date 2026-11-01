// ============================================================
// File:        change.js
// Path:        server/src/settings/change.js
// Project:     Seasonal Entertainment
// Description: Stores one site setting a staff member changed and writes its audit entry
//              (setting.change, with the old and new value). Shared by the admin settings
//              route (adminRoutes.js) and the organisers' banner route (bannerRoutes.js), so
//              both change and audit a setting the same way. The value must have passed
//              checkSetting (store.js) first.
// ============================================================

import { recordAudit } from '../audit/auditLog.js';
import { getSetting, setSetting } from './store.js';

export function changeSetting(db, user, key, value) {
  const before = getSetting(db, key);
  setSetting(db, key, value);
  recordAudit(db, user, {
    action: 'setting.change',
    targetType: 'setting',
    targetId: key,
    before: { value: before },
    after: { value },
  });
}
