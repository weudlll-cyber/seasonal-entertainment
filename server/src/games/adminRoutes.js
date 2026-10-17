// ============================================================
// File:        adminRoutes.js
// Path:        server/src/games/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/games (admins only): list all, create, edit, delete game cards.
//              Every change writes one audit entry with the fields that changed.
// ============================================================

import express from 'express';
import {
  GAME_IMAGES,
  GAME_PATH_PATTERN,
  GAME_STATUSES,
  GAME_VISIBILITIES,
} from '@seasonal-entertainment/shared/gameRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { sendError } from '../http/errors.js';
import { required, validBody } from '../http/validate.js';
import {
  DuplicatePathError,
  createGame,
  deleteGame,
  findGame,
  listAllGames,
  updateGame,
} from './store.js';

const oneOf = (label, list) => (v) =>
  list.includes(v) ? null : `${label} must be one of: ${list.join(', ')}.`;

const GAME_FIELDS = {
  name: required('Name', 80),
  description: (v) =>
    v === undefined || (typeof v === 'string' && v.length <= 300)
      ? null
      : 'Description must be text of at most 300 characters.',
  image: oneOf('Image', GAME_IMAGES),
  status: oneOf('Status', GAME_STATUSES),
  path: (v) =>
    typeof v === 'string' && v.length <= 60 && GAME_PATH_PATTERN.test(v)
      ? null
      : 'Path must look like /games/name (lowercase letters, digits, "-").',
  visibility: oneOf('Visibility', GAME_VISIBILITIES),
};

export function adminGameRoutes(db) {
  const router = express.Router();

  // Loaded after allow(): who may not use these routes cannot probe which ids exist.
  const loadGame = loadById((id) => findGame(db, id), 'game', 'game');

  const audit = (req, action, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType: 'game', targetId, before, after });
  const pathTaken = (res) => sendError(res, 409, 'path_taken', 'Another game uses this path.');

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, games: listAllGames(db) });
  });

  router.post('/', allow('admin'), (req, res) => {
    const input = validBody(req, res, GAME_FIELDS);
    if (!input) return;
    try {
      const game = createGame(db, input);
      audit(req, 'game.create', game.id, null, { name: game.name, status: game.status });
      res.status(201).json({ ok: true, game });
    } catch (err) {
      if (err instanceof DuplicatePathError) return pathTaken(res);
      throw err;
    }
  });

  router.put('/:id', allow('admin'), loadGame, (req, res) => {
    const input = validBody(req, res, GAME_FIELDS);
    if (!input) return;
    try {
      const game = updateGame(db, req.game.id, input);
      const before = {};
      const after = {};
      for (const key of Object.keys(GAME_FIELDS)) {
        if (req.game[key] !== game[key]) {
          before[key] = req.game[key];
          after[key] = game[key];
        }
      }
      audit(req, 'game.edit', game.id, before, after);
      res.json({ ok: true, game });
    } catch (err) {
      if (err instanceof DuplicatePathError) return pathTaken(res);
      throw err;
    }
  });

  router.delete('/:id', allow('admin'), loadGame, (req, res) => {
    deleteGame(db, req.game.id);
    audit(req, 'game.delete', req.game.id, { name: req.game.name }, null);
    res.json({ ok: true });
  });

  return router;
}
