// ============================================================
// File:        adminRoutes.js
// Path:        server/src/discord/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/discord (admins only, with 2FA; docs/AUTH.md, "Discord: steps"): the
//              three ladders with their steps in order, each with its Discord role id (a
//              snowflake, unique), its icon and the rooms whose rule names it; add, rename and
//              remove steps (not one a room names), reorder a ladder, upload or clear an icon
//              (the raw file as the body: PNG, WebP or SVG, drawn into a 64 x 64 WebP by the
//              chat handle's images.storeIcon, media/icons.js), or take it from a link to
//              Discord's image servers, fetched once (iconLink.js) and then stored exactly like
//              an upload; and the role ids seen on linked
//              members that no step has yet (ids and counts only), to help fill them in. Every
//              change writes one audit entry. Steps never grant rights on the site.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { required, validBody } from '../http/validate.js';
import { IconLinkError, fetchIconLink } from './iconLink.js';
import { LADDERS, listSteps } from './steps.js';
import {
  RoleIdTakenError,
  StepInUseError,
  addStep,
  findStep,
  ladderIds,
  removeStep,
  reorderLadder,
  setIcon,
  unmappedRoleIds,
  updateStep,
} from './stepStore.js';

const SNOWFLAKE = /^\d{17,20}$/;
const ladderField = (v) =>
  LADDERS.includes(v) ? null : `Ladder must be one of: ${LADDERS.join(', ')}.`;
// A Discord role id, or null for none yet.
const roleIdField = (v) =>
  v === null || (typeof v === 'string' && SNOWFLAKE.test(v))
    ? null
    : 'The role id must be a Discord id (17-20 digits), or empty.';
const STEP_FIELDS = { name: required('Name', 40), roleId: roleIdField };

// images: the chat handle's images (chat/mount.js): storeIcon, download, remove, url. network: how
// "Icon from link" reaches the internet (safeFetch's; tests pass a pretend one).
export function adminDiscordRoutes(db, images, network) {
  const router = express.Router();
  const audit = (req, action, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType: 'discord_step', targetId, before, after });
  const loadStep = loadById((id) => findStep(db, id), 'step', 'step');
  const rawFile = express.raw({ type: () => true, limit: '300kb' });
  const shown = ({ iconFile, ...step }) => ({
    ...step,
    icon: iconFile ? images.url(iconFile) : null,
  });
  const before = ({ name, roleId }) => ({ name, roleId });

  router.get('/', allow('admin'), (_req, res) => {
    const rooms = db
      .prepare(
        `SELECT rr.step_id AS stepId, r.name FROM room_step_rules rr
         JOIN chat_rooms r ON r.id = rr.room_id ORDER BY r.position, r.id`
      )
      .all();
    const steps = listSteps(db).map((s) => ({
      ...shown(s),
      rooms: rooms.filter((r) => r.stepId === s.id).map((r) => r.name),
    }));
    res.json({ ok: true, ladders: LADDERS, steps, unmapped: unmappedRoleIds(db) });
  });

  // RoleIdTakenError: another step has that role id.
  function saving(res, work) {
    try {
      return work();
    } catch (err) {
      if (!(err instanceof RoleIdTakenError)) throw err;
      sendError(res, 409, 'role_id_taken', 'Another step has this role id.');
      return null;
    }
  }

  router.post('/steps', allow('admin'), (req, res) => {
    const input = validBody(req, res, { ladder: ladderField, ...STEP_FIELDS });
    if (!input) return;
    const step = saving(res, () => addStep(db, input));
    if (!step) return;
    audit(req, 'discord.step_create', step.id, null, input);
    res.status(201).json({ ok: true, step: shown(step) });
  });

  router.put('/steps/:id', allow('admin'), loadStep, (req, res) => {
    const input = validBody(req, res, STEP_FIELDS);
    if (!input) return;
    const step = saving(res, () => updateStep(db, req.step.id, input));
    if (!step) return;
    audit(req, 'discord.step_edit', step.id, before(req.step), input);
    res.json({ ok: true, step: shown(step) });
  });

  // ids: every step of the ladder exactly once, lowest first.
  router.post('/ladders/:ladder/order', allow('admin'), (req, res) => {
    if (ladderField(req.params.ladder)) return sendError(res, 404, 'not_found', 'No such ladder.');
    const current = ladderIds(db, req.params.ladder);
    const sameSet = (ids) =>
      Array.isArray(ids) && [...ids].sort().join() === [...current].sort().join();
    const input = validBody(req, res, {
      ids: (v) => (sameSet(v) ? null : 'ids must list every step of the ladder exactly once.'),
    });
    if (!input) return;
    reorderLadder(db, input.ids);
    audit(
      req,
      'discord.ladder_reorder',
      null,
      { [req.params.ladder]: current },
      {
        [req.params.ladder]: input.ids,
      }
    );
    res.json({ ok: true });
  });

  router.delete('/steps/:id', allow('admin'), loadStep, (req, res) => {
    try {
      removeStep(db, req.step.id);
    } catch (err) {
      if (!(err instanceof StepInUseError)) throw err;
      return sendError(
        res,
        409,
        'step_in_use',
        'A room is open from this step on. Change that room first.'
      );
    }
    if (req.step.iconFile) images.remove(req.step.iconFile);
    audit(req, 'discord.step_delete', req.step.id, before(req.step), null);
    res.json({ ok: true });
  });

  // An uploaded or fetched file through the one icon pipeline; the old icon file goes.
  async function keepIcon(req, res, buffer) {
    const stored = await images.storeIcon(buffer);
    if (!stored.ok) return sendError(res, 400, 'invalid_file', stored.message);
    const old = setIcon(db, req.step.id, stored.file);
    if (old) images.remove(old);
    audit(req, 'discord.step_icon', req.step.id, { icon: Boolean(old) }, { icon: true });
    res.json({ ok: true, step: shown(findStep(db, req.step.id)) });
  }

  // The file is the request body.
  router.post('/steps/:id/icon', allow('admin'), loadStep, rawFile, (req, res) =>
    keepIcon(req, res, req.body)
  );

  // { url }: a link to cdn.discordapp.com or media.discordapp.net, fetched once.
  router.post('/steps/:id/icon-link', allow('admin'), loadStep, async (req, res) => {
    const input = validBody(req, res, { url: required('Link', 2000) });
    if (!input) return;
    let buffer;
    try {
      buffer = await fetchIconLink(input.url, images.download, network);
    } catch (err) {
      if (!(err instanceof IconLinkError)) throw err;
      return sendError(res, 400, 'icon_link', err.message);
    }
    return keepIcon(req, res, buffer);
  });

  router.delete('/steps/:id/icon', allow('admin'), loadStep, (req, res) => {
    const old = setIcon(db, req.step.id, null);
    if (old) images.remove(old);
    audit(req, 'discord.step_icon', req.step.id, { icon: Boolean(old) }, { icon: false });
    res.json({ ok: true });
  });

  return router;
}
