// ============================================================
// File:        routes.js
// Path:        server/src/media/routes.js
// Project:     Seasonal Entertainment
// Description: GET /api/chat/media for the chat picker: the active sticker and GIF packs in
//              order with their active items. Members only, like sending them (guests write
//              text and emojis).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { listLibrary } from './store.js';

export function mediaRoutes(db) {
  const router = express.Router();
  router.get('/media', allow('member'), (_req, res) => {
    const packs = listLibrary(db, { activeOnly: true })
      .filter((pack) => pack.items.length > 0)
      .map(({ id, name, kind, items }) => ({
        id,
        name,
        kind,
        items: items.map(({ id, name, alt, credit, url, width, height }) => ({
          id,
          name,
          alt,
          credit,
          url,
          width,
          height,
        })),
      }));
    res.json({ ok: true, packs });
  });
  return router;
}
