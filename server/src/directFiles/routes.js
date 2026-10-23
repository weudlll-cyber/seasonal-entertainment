// ============================================================
// File:        routes.js
// Path:        server/src/directFiles/routes.js
// Project:     Seasonal Entertainment
// Description: Files in direct messages (docs/CHAT.md, "Files in direct messages"). The
//              sender's browser encrypts the file (shared/crypto.js, encryptFile) and uploads
//              only the ciphertext: POST /api/chat/direct/:id/files (raw body). The room
//              uploads' limits apply: per-file size (plus the encryption's few bytes), the
//              daily quota counted together with room uploads, the upload rate limit. The
//              server cannot see the content, so it makes no thumbnails and checks no types.
//              GET /api/chat/direct/files/:fileId serves the ciphertext to the two members of
//              the conversation only (a pending one to its uploader); everyone else gets 404.
//              Reports: the reporter's browser decrypts a shared message's file and uploads
//              that copy (POST .../:id/reports/:reportId/files/:messageId); moderators download
//              it (GET /api/chat/direct-reports/:id/files/:messageId, audited, a download only).
// ============================================================

import path from 'node:path';
import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { partnerHandlers } from '../chat/directPartner.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { saveMediaFile } from '../media/files.js';
import { bytesUploadedSince } from '../uploads/store.js';
import {
  DIRECT_FOLDER,
  REPORT_FOLDER,
  createDirectFile,
  createReportFile,
  directBytesSince,
  fileOfMessage,
  findDirectFile,
  findReportFile,
  isSharedCopy,
  mayFetchDirectFile,
} from './store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// secretstream: a 24-byte header and 17 bytes per 64 KB chunk.
const STREAM_OVERHEAD = (maxBytes) => 24 + 17 * (Math.ceil(maxBytes / (64 * 1024)) + 1);
const NAME_MAX = 100;

// A file sent as a download that no browser renders: the site never shows these itself.
function sendDownload(res, config, file, name) {
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.attachment(name);
  res.type('application/octet-stream');
  res.sendFile(path.join(config.mediaDir, file));
}

// { member: router for /api/chat/direct, moderator: router for /api/chat/direct-reports }.
export function directFileRoutes(db, config) {
  const member = express.Router();
  const moderator = express.Router();
  const { maxBytes, dailyBytes } = config.uploads;
  const perMember = makeLimiter(config.rateLimits.chatUpload, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const raw = (limit) => express.raw({ type: () => true, limit });
  const fileId = (req) => Number.parseInt(req.params.fileId, 10);

  // One daily quota for room and direct uploads.
  const overQuota = (userId, adding) => {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    return (
      bytesUploadedSince(db, userId, since) + directBytesSince(db, userId, since) + adding >
      dailyBytes
    );
  };

  member.post(
    '/:id/files',
    allow('member'),
    ...partnerHandlers(db),
    perMember,
    raw(maxBytes + STREAM_OVERHEAD(maxBytes)),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length < 24 + 17) {
        return sendError(res, 400, 'invalid_file', 'This is not an encrypted file.');
      }
      if (overQuota(req.user.id, req.body.length)) {
        const mb = Math.round(dailyBytes / 1024 / 1024);
        return sendError(res, 429, 'upload_quota', `Upload limit reached: ${mb} MB per 24 hours.`);
      }
      const file = saveMediaFile(config, req.body, 'bin', DIRECT_FOLDER);
      const id = createDirectFile(db, {
        uploaderId: req.user.id,
        partnerId: req.partner.id,
        file,
        bytes: req.body.length,
      });
      res.status(201).json({ ok: true, file: { id } });
    }
  );

  // Not one of the two members, or no such file: the same plain 404.
  member.get('/files/:fileId', allow('member'), (req, res) => {
    const file = findDirectFile(db, fileId(req));
    if (!mayFetchDirectFile(file, req.user.id)) {
      return sendError(res, 404, 'not_found', 'No such file.');
    }
    sendDownload(res, config, file.file, 'encrypted.bin');
  });

  // The reporter's decrypted copy of a shared message's file (once per message).
  // Not counted against the daily upload quota (decided 2026-10-23): a copy of a file already
  // counted when its sender uploaded it, once per message, so a full quota never blocks a report.
  member.post(
    '/:id/reports/:reportId/files/:messageId',
    allow('member'),
    ...partnerHandlers(db),
    perMember,
    raw(maxBytes),
    (req, res) => {
      const reportId = Number.parseInt(req.params.reportId, 10);
      const messageId = Number.parseInt(req.params.messageId, 10);
      const shared = isSharedCopy(db, {
        reportId,
        reporterId: req.user.id,
        partnerId: req.partner.id,
        messageId,
      });
      const name = String(req.query.name ?? '').slice(0, NAME_MAX);
      if (!shared || !fileOfMessage(db, messageId) || !name || !Buffer.isBuffer(req.body)) {
        return sendError(res, 404, 'not_found', 'No such shared message with a file.');
      }
      if (findReportFile(db, reportId, messageId)) {
        return sendError(res, 409, 'already_shared', 'This file was shared already.');
      }
      const file = saveMediaFile(config, req.body, 'bin', REPORT_FOLDER);
      createReportFile(db, { reportId, messageId, name, file, bytes: req.body.length });
      res.status(201).json({ ok: true });
    }
  );

  // Every download of a shared file is audited, as every view of shared copies is.
  moderator.get('/:id/files/:messageId', allow('organiser'), (req, res) => {
    const reportId = Number.parseInt(req.params.id, 10);
    const found = findReportFile(db, reportId, Number.parseInt(req.params.messageId, 10));
    if (!found) return sendError(res, 404, 'not_found', 'No such file.');
    recordAudit(db, req.user, {
      action: 'chat.direct_report_file_view',
      targetType: 'direct_report',
      targetId: reportId,
      before: null,
      after: { file: found.name },
    });
    sendDownload(res, config, found.file, found.name);
  });

  return { member, moderator };
}
