// ============================================================
// File:        recordingPreviewRoutes.js
// Path:        server/src/calls/recordingPreviewRoutes.js
// Project:     Seasonal Entertainment
// Description: A recording's preview image (docs/CALLS.md, "A recording's preview image";
//              decided 2026-11-14), on only when recording is set up:
//              - POST /api/calls/:id/recordings/:rid/preview: the image as the raw body, either a
//                frame the recording's page took from the playing video or an uploaded picture.
//                Organisers and admins (the same who delete recordings); the chat images' rules
//                (image types, the size and megapixel settings) through the chat's own picture
//                path (chat.images.storePicture, as profile pictures). Replaces an earlier one.
//              - DELETE the same: back to the site's logo.
//              - GET /api/calls/recordings/:rid/preview/:variant (full or thumb): for everyone,
//                as the recordings themselves, so the sites a link is posted to can show it.
//              Setting and removing are audited (call.recording_preview_set and _remove).
// ============================================================

import path from 'node:path';
import express from 'express';
import { allow } from '../http/access.js';
import { rawBody } from '../http/bodies.js';
import { sendError } from '../http/errors.js';
import { deleteFiles } from '../profiles/routes.js';
import { findPreview, removeRecordingPreview, setRecordingPreview } from './recordingPreview.js';
import { recordingSteps } from './recordingRoutes.js';

const VARIANTS = { full: 'previewFile', thumb: 'previewThumb' };

// chat: mountChat's handle (its images: storePicture, pictureMaxBytes, remove).
export function recordingPreviewRoutes(db, config, service, chat) {
  const router = express.Router();
  const { steps, enabled, audit, manage, loadRecording } = recordingSteps(db, config, service);
  // The size limit is a setting: read per request (as the chat's uploads and profile pictures).
  const rawFile = (req, res, next) => rawBody(chat.images.pictureMaxBytes())(req, res, next);

  router.get(
    '/recordings/:rid/preview/:variant',
    allow('public'),
    steps.configured,
    enabled,
    (req, res) => {
      const found = findPreview(db, Number.parseInt(req.params.rid, 10) || 0);
      const file = found?.[VARIANTS[req.params.variant]];
      if (!file) return sendError(res, 404, 'not_found', 'No such image.');
      // A new image is a new address (recordingPreview.js), so this one may be kept a day.
      res.set('Cache-Control', 'public, max-age=86400');
      res.type(found.previewMime);
      res.sendFile(path.join(config.mediaDir, file));
    }
  );

  router.post(
    '/:id/recordings/:rid/preview',
    ...manage,
    loadRecording,
    rawFile,
    async (req, res) => {
      const picture = Buffer.isBuffer(req.body) ? await chat.images.storePicture(req.body) : null;
      if (!picture?.ok) {
        return sendError(res, 400, 'invalid_file', picture?.message ?? 'No image was sent.');
      }
      deleteFiles(chat, setRecordingPreview(db, req.recording.id, picture.stored));
      audit(req, 'call.recording_preview_set', req.call, {
        title: req.call.title,
        recording: req.recording.id,
      });
      res.status(201).json({ ok: true });
    }
  );

  router.delete('/:id/recordings/:rid/preview', ...manage, loadRecording, (req, res) => {
    const removed = removeRecordingPreview(db, req.recording.id);
    deleteFiles(chat, removed);
    // Only an image that was there is a change worth an entry.
    if (removed.length) {
      audit(req, 'call.recording_preview_remove', req.call, {
        title: req.call.title,
        recording: req.recording.id,
      });
    }
    res.json({ ok: true });
  });

  return router;
}
