// ============================================================
// File:        adminRoutes.js
// Path:        server/src/media/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/chat/media (admins only, with 2FA): the whole library; create,
//              rename, (de)activate and reorder packs; upload items (raw file body, real type
//              and limits checked by imageCheck.js, generated file name), edit their name, alt
//              text, credit and active state, delete them. Every change writes one audit entry.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { required, validBody } from '../http/validate.js';
import { deleteMediaFile, saveMediaFile } from './files.js';
import { ImageRejected, checkImage, libraryRules } from './imageCheck.js';
import {
  addItem,
  createPack,
  deleteItem,
  findItem,
  findPack,
  listLibrary,
  publicItem,
  reorderPacks,
  updateItem,
  updatePack,
} from './store.js';

const isBoolean = (label) => (v) =>
  typeof v === 'boolean' ? null : `${label} must be true or false.`;
const optionalText = (label, max) => (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.length <= max)
    ? null
    : `${label} must be at most ${max} characters.`;

const ITEM_TEXT = {
  name: required('Name', 60),
  alt: required('Alt text', 200),
  credit: optionalText('Credit', 100),
};

export function adminMediaRoutes(db, config) {
  const router = express.Router();
  const audit = (req, action, targetType, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType, targetId, before, after });
  const loadPack = loadById((id) => findPack(db, id), 'pack', 'pack');
  const loadItem = loadById((id) => findItem(db, id), 'item', 'item');
  // The largest allowed file of any kind; each kind's own limit is checked after parsing.
  const rawFile = express.raw({ type: () => true, limit: config.media.gif.maxBytes });

  router.get('/', allow('admin'), (_req, res) => res.json({ ok: true, packs: listLibrary(db) }));

  router.post('/packs', allow('admin'), (req, res) => {
    const input = validBody(req, res, {
      name: required('Name', 60),
      kind: (v) => (['sticker', 'gif'].includes(v) ? null : 'Kind must be sticker or gif.'),
    });
    if (!input) return;
    const pack = createPack(db, input);
    audit(req, 'media.pack_create', 'media_pack', pack.id, null, input);
    res.status(201).json({ ok: true, pack });
  });

  router.put('/packs/:id', allow('admin'), loadPack, (req, res) => {
    const input = validBody(req, res, { name: required('Name', 60), active: isBoolean('Active') });
    if (!input) return;
    const pack = updatePack(db, req.pack.id, input);
    const { name, active } = req.pack;
    audit(req, 'media.pack_edit', 'media_pack', pack.id, { name, active }, input);
    res.json({ ok: true, pack });
  });

  router.post('/packs/reorder', allow('admin'), (req, res) => {
    const current = listLibrary(db).map((p) => p.id);
    const sameSet = (ids) =>
      Array.isArray(ids) && [...ids].sort().join() === [...current].sort().join();
    const input = validBody(req, res, {
      ids: (v) => (sameSet(v) ? null : 'ids must list every pack exactly once.'),
    });
    if (!input) return;
    reorderPacks(db, input.ids);
    audit(req, 'media.pack_reorder', 'media_pack', null, { order: current }, { order: input.ids });
    res.json({ ok: true });
  });

  // The file is the request body; name, alt and credit come in the query string.
  router.post('/packs/:id/items', allow('admin'), loadPack, rawFile, async (req, res) => {
    const text = validBody({ body: req.query }, res, ITEM_TEXT);
    if (!text) return;
    let image;
    try {
      image = await checkImage(req.body, libraryRules(config, req.pack.kind));
    } catch (err) {
      if (!(err instanceof ImageRejected)) throw err;
      return sendError(res, 400, 'invalid_file', err.message);
    }
    const file = saveMediaFile(config, req.body, image.ext);
    const item = addItem(db, req.pack.id, text, image, file, req.body.length);
    audit(req, 'media.item_upload', 'media_item', item.id, null, { pack: req.pack.name, ...text });
    res.status(201).json({ ok: true, item: publicItem(item) });
  });

  router.put('/items/:id', allow('admin'), loadItem, (req, res) => {
    const input = validBody(req, res, { ...ITEM_TEXT, active: isBoolean('Active') });
    if (!input) return;
    const { name, alt, credit, active } = req.item;
    const item = updateItem(db, req.item.id, input);
    audit(
      req,
      'media.item_edit',
      'media_item',
      item.id,
      { name, alt, credit, active: active === 1 },
      input
    );
    res.json({ ok: true, item: publicItem(item) });
  });

  // Old messages with this item then show "media removed".
  router.delete('/items/:id', allow('admin'), loadItem, (req, res) => {
    deleteItem(db, req.item.id);
    deleteMediaFile(config, req.item.file);
    audit(req, 'media.item_delete', 'media_item', req.item.id, { name: req.item.name }, null);
    res.json({ ok: true });
  });

  return router;
}
