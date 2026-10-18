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

export function adminAuditRoutes(db) {
  const router = express.Router();
  router.get('/', allow('admin'), (req, res) => {
    const before = /^\d+$/.test(req.query.before ?? '') ? Number(req.query.before) : undefined;
    res.json({ ok: true, entries: listAudit(db, { beforeId: before }) });
  });
  return router;
}
