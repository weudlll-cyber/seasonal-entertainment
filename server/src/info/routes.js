// ============================================================
// File:        routes.js
// Path:        server/src/info/routes.js
// Project:     Seasonal Entertainment
// Description: Public /api/info: the list of published pages and one published page by slug.
//              Drafts do not exist for the public: a draft slug answers 404 like a missing one.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { findPublished, listPublished } from './store.js';

export function infoRoutes(db) {
  const router = express.Router();

  router.get('/', allow('public'), (_req, res) => {
    res.json({ ok: true, pages: listPublished(db) });
  });

  router.get('/:slug', allow('public'), (req, res) => {
    const page = findPublished(db, req.params.slug);
    if (!page) return sendError(res, 404, 'not_found', 'No such page.');
    const { slug, title, body, updatedAt } = page;
    res.json({ ok: true, page: { slug, title, body, updatedAt } });
  });

  return router;
}
