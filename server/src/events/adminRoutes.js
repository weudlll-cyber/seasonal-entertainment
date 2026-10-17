// ============================================================
// File:        adminRoutes.js
// Path:        server/src/events/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/events (admins only): list all, create, edit (including
//              deactivating), delete. Events change without code changes (decided 2026-10-16).
//              Every change writes one audit entry with the fields that changed.
// ============================================================

import express from 'express';
import { RULES } from '@seasonal-entertainment/shared/eventSchedule.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { loadById } from '../http/loadById.js';
import { required, validBody } from '../http/validate.js';
import { createEvent, deleteEvent, findEvent, listAllEvents, updateEvent } from './store.js';

const text = (label, max) => (v) =>
  v === undefined || (typeof v === 'string' && v.length <= max)
    ? null
    : `${label} must be text of at most ${max} characters.`;

const EVENT_FIELDS = {
  title: required('Title', 100),
  description: text('Description', 1000),
  rule: (v) => (RULES.includes(v) ? null : 'Rule must be "weekly" or "monthly_first".'),
  weekday: (v) =>
    Number.isInteger(v) && v >= 1 && v <= 7 ? null : 'Weekday must be 1 (Monday) to 7 (Sunday).',
  timeUtc: (v) =>
    typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
      ? null
      : 'Time must be HH:MM (UTC).',
  durationMinutes: (v) =>
    v === undefined || v === null || (Number.isInteger(v) && v >= 1 && v <= 1440)
      ? null
      : 'Duration must be 1 to 1440 minutes, or empty.',
  channel: text('Channel', 100),
  // Only https links: the public page renders them as clickable.
  link: (v) =>
    v === undefined ||
    v === '' ||
    (typeof v === 'string' && v.length <= 300 && /^https:\/\/\S+$/.test(v))
      ? null
      : 'Link must start with https:// (or be empty).',
  active: (v) =>
    v === undefined || typeof v === 'boolean' ? null : 'Active must be true or false.',
};

// The fields that differ, as { before, after } for the audit log.
function changes(before, after) {
  const diff = { before: {}, after: {} };
  for (const key of Object.keys(EVENT_FIELDS)) {
    if (before[key] !== after[key]) {
      diff.before[key] = before[key];
      diff.after[key] = after[key];
    }
  }
  return diff;
}

export function adminEventRoutes(db) {
  const router = express.Router();

  // Loaded after allow(): who may not use these routes cannot probe which ids exist.
  const loadEvent = loadById((id) => findEvent(db, id), 'event', 'event');

  const audit = (req, action, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType: 'event', targetId, before, after });

  router.get('/', allow('admin'), (_req, res) => {
    res.json({ ok: true, events: listAllEvents(db) });
  });

  router.post('/', allow('admin'), (req, res) => {
    const input = validBody(req, res, EVENT_FIELDS);
    if (!input) return;
    const event = createEvent(db, input);
    audit(req, 'event.create', event.id, null, {
      title: event.title,
      weekday: event.weekday,
      timeUtc: event.timeUtc,
    });
    res.status(201).json({ ok: true, event });
  });

  router.put('/:id', allow('admin'), loadEvent, (req, res) => {
    const input = validBody(req, res, EVENT_FIELDS);
    if (!input) return;
    const event = updateEvent(db, req.event.id, input);
    const { before, after } = changes(req.event, event);
    audit(req, 'event.edit', event.id, before, after);
    res.json({ ok: true, event });
  });

  router.delete('/:id', allow('admin'), loadEvent, (req, res) => {
    deleteEvent(db, req.event.id);
    audit(req, 'event.delete', req.event.id, { title: req.event.title }, null);
    res.json({ ok: true });
  });

  return router;
}
