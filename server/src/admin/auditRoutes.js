// ============================================================
// File:        auditRoutes.js
// Path:        server/src/admin/auditRoutes.js
// Project:     Seasonal Entertainment
// Description: GET /api/admin/audit (admins only): the audit log, newest first, 50 per page;
//              ?before=<id> continues with older entries.
// ============================================================

import express from 'express';
import { listAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { queryId } from '../http/validate.js';

export function adminAuditRoutes(db) {
  const router = express.Router();
  router.get('/', allow('admin'), (req, res) => {
    res.json({ ok: true, entries: listAudit(db, { beforeId: queryId(req.query.before) }) });
  });
  return router;
}
