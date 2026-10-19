// ============================================================
// File:        adminRoutes.js
// Path:        server/src/info/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/info (admins only): list all pages, read one, create, edit,
//              publish/unpublish, reorder. Every change writes one audit entry. The slug
//              "prices" is reserved: /info/prices is the site's price chart (docs/BOTS.md).
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { sendError } from '../http/errors.js';
import { required, validBody } from '../http/validate.js';
import {
  DuplicateSlugError,
  createPage,
  findById,
  listAll,
  reorder,
  setStatus,
  updatePage,
} from './store.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Paths under /info/ that are pages of the site itself: such an info page could never be opened.
const RESERVED_SLUGS = ['prices'];
const BODY_MAX = 50_000;

const PAGE_FIELDS = {
  slug: (v) => {
    if (RESERVED_SLUGS.includes(v)) return `The slug "${v}" belongs to a page of the site itself.`;
    return typeof v === 'string' && v.length <= 60 && SLUG_PATTERN.test(v)
      ? null
      : 'Slug must be lowercase letters and digits, words joined by "-" (at most 60).';
  },
  title: required('Title', 120),
  body: (v) =>
    typeof v === 'string' && v.length <= BODY_MAX
      ? null
      : `Body must be text of at most ${BODY_MAX} characters.`,
};

export function adminInfoRoutes(db) {
  const router = express.Router();

  // Loaded after allow(): who may not use these routes cannot probe which ids exist.
  const loadPage = loadById((id) => findById(db, id), 'page', 'page');

  const audit = (req, action, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType: 'info_page', targetId, before, after });

  const slugTaken = (res) => sendError(res, 409, 'slug_taken', 'Another page has this slug.');

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, pages: listAll(db) });
  });

  router.get('/:id', allow('admin'), loadPage, (req, res) => {
    res.json({ ok: true, page: req.page });
  });

  router.post('/', allow('admin'), (req, res) => {
    const input = validBody(req, res, PAGE_FIELDS);
    if (!input) return;
    try {
      const page = createPage(db, input, req.user.username);
      audit(req, 'info.create', page.id, null, { slug: page.slug, title: page.title });
      res.status(201).json({ ok: true, page });
    } catch (err) {
      if (err instanceof DuplicateSlugError) return slugTaken(res);
      throw err;
    }
  });

  router.put('/:id', allow('admin'), loadPage, (req, res) => {
    const input = validBody(req, res, PAGE_FIELDS);
    if (!input) return;
    try {
      const page = updatePage(db, req.page.id, input, req.user.username);
      // Only what changed; the body is recorded by length, not copied into the log.
      const before = {};
      const after = {};
      for (const field of ['slug', 'title']) {
        if (req.page[field] !== page[field]) {
          before[field] = req.page[field];
          after[field] = page[field];
        }
      }
      if (req.page.body !== page.body) {
        before.bodyLength = req.page.body.length;
        after.bodyLength = page.body.length;
      }
      audit(req, 'info.edit', page.id, before, after);
      res.json({ ok: true, page });
    } catch (err) {
      if (err instanceof DuplicateSlugError) return slugTaken(res);
      throw err;
    }
  });

  router.post('/:id/status', allow('admin'), loadPage, (req, res) => {
    const input = validBody(req, res, {
      status: (v) =>
        ['draft', 'published'].includes(v) ? null : 'Status must be draft or published.',
    });
    if (!input) return;
    setStatus(db, req.page.id, input.status, req.user.username);
    audit(
      req,
      input.status === 'published' ? 'info.publish' : 'info.unpublish',
      req.page.id,
      {
        status: req.page.status,
      },
      { status: input.status }
    );
    res.json({ ok: true });
  });

  router.post('/reorder', allow('admin'), (req, res) => {
    const current = listAll(db).map((p) => p.id);
    const sameSet = (ids) =>
      Array.isArray(ids) && [...ids].sort().join() === [...current].sort().join();
    const input = validBody(req, res, {
      ids: (v) => (sameSet(v) ? null : 'ids must list every page exactly once.'),
    });
    if (!input) return;
    reorder(db, input.ids);
    audit(req, 'info.reorder', null, { order: current }, { order: input.ids });
    res.json({ ok: true });
  });

  return router;
}
