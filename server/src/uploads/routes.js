// ============================================================
// File:        routes.js
// Path:        server/src/uploads/routes.js
// Project:     Seasonal Entertainment
// Description: Chat file uploads (members only, decided 2026-10-17): upload a file (raw body,
//              name in the query; per-file size, daily quota, rate limit), fetch it, and the
//              moderators' "Remove file". Uploaded files are not public: every fetch checks
//              that the viewer may read the message's room, hidden messages' files go to
//              moderators only, a not-yet-sent file to its uploader only. PDFs are served only
//              as a download, sandboxed.
// ============================================================

import path from 'node:path';
import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { findMessage } from '../chat/messages.js';
import { findRoom } from '../chat/store.js';
import { canRead, chatViewer, isModerator } from '../chat/viewer.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import { deleteMediaFile } from '../media/files.js';
import { ImageRejected } from '../media/imageCheck.js';
import { processUpload } from './process.js';
import {
  bytesUploadedSince,
  createUpload,
  findUpload,
  findUploadForMessage,
  removeUploadFiles,
} from './store.js';
import { fileView } from './view.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function uploadRoutes(db, config, hub) {
  const router = express.Router();
  const perMember = makeLimiter(config.rateLimits.chatUpload, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const rawFile = express.raw({ type: () => true, limit: config.uploads.maxBytes });
  const loadUpload = loadById((id) => findUpload(db, id), 'upload', 'file');
  const loadMessage = loadById((id) => findMessage(db, id), 'message', 'message');

  // The same rule as reading the chat, for the message the file belongs to.
  function mayFetch(req, upload) {
    if (!upload.messageId) {
      return !upload.attachedAt && req.user?.id === upload.userId; // not sent yet: uploader only
    }
    const viewer = chatViewer(req);
    const message = findMessage(db, upload.messageId);
    const room = message && findRoom(db, message.roomId);
    if (!room || !canRead(room, viewer)) return false;
    return !message.hiddenAt || isModerator(viewer);
  }

  router.post('/uploads', allow('member'), perMember, rawFile, async (req, res) => {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    if (bytesUploadedSince(db, req.user.id, since) + req.body.length > config.uploads.dailyBytes) {
      const mb = Math.round(config.uploads.dailyBytes / 1024 / 1024);
      return sendError(res, 429, 'upload_quota', `Upload limit reached: ${mb} MB per 24 hours.`);
    }
    let stored;
    try {
      stored = await processUpload(req.body, req.query.name, config);
    } catch (err) {
      if (!(err instanceof ImageRejected)) throw err;
      return sendError(res, 400, 'invalid_file', err.message);
    }
    res.status(201).json({ ok: true, upload: fileView(createUpload(db, req.user.id, stored)) });
  });

  // variant: thumb or full (images), download (PDFs). Anything not allowed is a plain 404.
  router.get('/files/:id/:variant', allow('public'), loadUpload, (req, res) => {
    const upload = req.upload;
    const image = upload.kind === 'image';
    const file =
      { thumb: image && upload.thumbFile, full: image && upload.file }[req.params.variant] ??
      (req.params.variant === 'download' && !image ? upload.file : null);
    if (!file || !mayFetch(req, upload)) return sendError(res, 404, 'not_found', 'No such file.');
    res.set('Cache-Control', 'private, no-store');
    if (!image) {
      // Never shown by the site itself: a download, and sandboxed should a browser open it.
      res.attachment(upload.name);
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    res.type(upload.mime);
    res.sendFile(path.join(config.mediaDir, file));
  });

  router.post('/messages/:id/file/remove', allow('organiser'), loadMessage, (req, res) => {
    const upload = findUploadForMessage(db, req.message.id);
    if (!upload?.file) return sendError(res, 404, 'not_found', 'This message has no file.');
    for (const file of removeUploadFiles(db, upload.id, req.user.username)) {
      deleteMediaFile(config, file);
    }
    recordAudit(db, req.user, {
      action: 'chat.file_remove',
      targetType: 'chat_message',
      targetId: req.message.id,
      before: { file: upload.name },
      after: { file: null },
    });
    hub.broadcast(req.message.roomId, { type: 'fileRemoved', id: req.message.id });
    res.json({ ok: true });
  });

  return router;
}
