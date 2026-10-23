// ============================================================
// File:        routes.js
// Path:        server/src/uploads/routes.js
// Project:     Seasonal Entertainment
// Description: Chat file uploads (members only, decided 2026-10-17): upload a file (raw body,
//              name in the query; while the "File uploads in rooms" setting is on; per-file
//              size, daily quota and pixel limit from the site settings, rate limit), fetch it,
//              and the
//              moderators' "Remove file". Uploaded files are not public: every fetch checks
//              that the viewer may read the message's room, hidden messages' files go to
//              moderators only, a not-yet-sent file to its uploader only. PDFs are served only
//              as a download, sandboxed. In the chat embedded on another site a member asks for
//              short-lived links to a file (POST /files/:id/links, fileLinks.js): the file route
//              then takes ?link= in place of the cookie, for that embed token's member.
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
import { imageMaxPixels, uploadLimits } from '../settings/derived.js';
import { getSetting } from '../settings/store.js';
import { activeTokenById } from '../embed/tokens.js';
import { fileLinks } from './fileLinks.js';
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

// embedOrigins: the approved sites (embed/origins.js), for the embed tokens of file links.
export function uploadRoutes(db, config, hub, embedOrigins) {
  const router = express.Router();
  const perMember = makeLimiter(config.rateLimits.chatUpload, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  // Built per request: the size limit is a setting, and a file over it is refused (413) before
  // it is held in memory.
  const rawFile = (req, res, next) =>
    express.raw({ type: () => true, limit: uploadLimits(db).maxBytes })(req, res, next);
  // Before the body is read: a switched-off feature never takes a file in.
  const uploadsOn = (_req, res, next) =>
    getSetting(db, 'chat.uploads')
      ? next()
      : sendError(res, 403, 'uploads_off', 'File uploads are switched off at the moment.');
  const loadUpload = loadById((id) => findUpload(db, id), 'upload', 'file');
  const loadMessage = loadById((id) => findMessage(db, id), 'message', 'message');
  const links = fileLinks(config.sessionSecret);

  // What a file has to offer: thumb and full for an image, download for a PDF.
  const variantsOf = (upload) => (upload.kind === 'image' ? ['thumb', 'full'] : ['download']);

  // A link instead of the cookie (an image in the chat on another site): its embed token's
  // member asks, as long as the link is intact, unexpired and the token still active.
  function linkViewer(req) {
    const tokenId = links.verify(req.query.link, req.upload.id, req.params.variant);
    const found = tokenId !== null && activeTokenById(db, embedOrigins, tokenId);
    if (!found) return false;
    req.user = found.user;
    req.embed = found;
    return true;
  }

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

  router.post('/uploads', allow('member'), uploadsOn, perMember, rawFile, async (req, res) => {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { maxBytes, dailyBytes } = uploadLimits(db);
    if (bytesUploadedSince(db, req.user.id, since) + req.body.length > dailyBytes) {
      const mb = Math.round(dailyBytes / 1024 / 1024);
      return sendError(res, 429, 'upload_quota', `Upload limit reached: ${mb} MB per 24 hours.`);
    }
    let stored;
    try {
      stored = await processUpload(req.body, req.query.name, config, {
        maxBytes,
        maxPixels: imageMaxPixels(db),
      });
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
    const allowed = (req.query.link === undefined || linkViewer(req)) && mayFetch(req, upload);
    if (!file || !allowed) return sendError(res, 404, 'not_found', 'No such file.');
    res.set('Cache-Control', 'private, no-store');
    if (!image) {
      // Never shown by the site itself: a download, and sandboxed should a browser open it.
      res.attachment(upload.name);
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    res.type(upload.mime);
    res.sendFile(path.join(config.mediaDir, file));
  });

  // For an embed token only (embed/auth.js lets it reach this while the site's "uploads" rule
  // is on): links to the file's variants, for whoever may fetch it now.
  router.post('/files/:id/links', allow('member'), loadUpload, (req, res) => {
    if (!req.embed) return sendError(res, 400, 'not_embedded', 'No embed token was sent.');
    if (!req.upload.file || !mayFetch(req, req.upload)) {
      return sendError(res, 404, 'not_found', 'No such file.');
    }
    const id = req.upload.id;
    const link = (variant) =>
      `/api/chat/files/${id}/${variant}?link=${links.sign(id, variant, req.embed.tokenId)}`;
    const names = { thumb: 'thumbUrl', full: 'url', download: 'downloadUrl' };
    res.json({
      ok: true,
      links: Object.fromEntries(variantsOf(req.upload).map((v) => [names[v], link(v)])),
    });
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
