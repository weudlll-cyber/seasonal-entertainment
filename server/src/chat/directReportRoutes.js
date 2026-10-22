// ============================================================
// File:        directReportRoutes.js
// Path:        server/src/chat/directReportRoutes.js
// Project:     Seasonal Entertainment
// Description: Reporting a direct message with consent (docs/CHAT.md, "Reporting a direct
//              message"). A member reports a message of their own conversation with a reason;
//              only when they tick "share", their browser decrypts the selected messages and
//              sends copies, which the server accepts only for messages that member sent or
//              received in that conversation. Without sharing, moderators get the reason and
//              the fact alone. Moderators (organisers, admins) list open reports, view shared
//              copies (audited on every view) and mark reports reviewed (audited); copies are
//              deleted 90 days after the review (retention.js).
// ============================================================

import express from 'express';
import { MESSAGE_MAX } from '@seasonal-entertainment/shared/chatRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import { positiveInteger, required, validBody } from '../http/validate.js';
import { partnerHandlers } from './directPartner.js';
import {
  conversationMessages,
  createDirectReport,
  findDirectReport,
  listDirectReports,
  markDirectReportReviewed,
  reportCopies,
} from './directReportStore.js';

const SHARED_MAX = 50;

// Shared copies: absent (nothing shared) or a list of { id, text, mediaItemId? }.
function sharedField(value) {
  if (value === undefined) return null;
  const valid =
    Array.isArray(value) &&
    value.length <= SHARED_MAX &&
    value.every(
      (c) =>
        positiveInteger('id')(c?.id) === null &&
        typeof c.text === 'string' &&
        c.text.length <= MESSAGE_MAX &&
        (c.mediaItemId === undefined || positiveInteger('mediaItemId')(c.mediaItemId) === null)
    );
  return valid ? null : 'The shared messages are malformed.';
}

// mounts: { member: router for /api/chat/direct, moderator: router for /api/chat/direct-reports }.
export function directReportRoutes(db, config) {
  const member = express.Router();
  const moderator = express.Router();
  const audit = (req, action, targetId, after) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'direct_report',
      targetId,
      before: null,
      after,
    });

  member.post(
    '/:id/report',
    allow('member'),
    ...partnerHandlers(db),
    makeLimiter(config.rateLimits.chatReport),
    (req, res) => {
      const input = validBody(req, res, {
        messageId: positiveInteger('Message'),
        reason: required('Reason', 1000),
        shared: sharedField,
      });
      if (!input) return;
      const shared = input.shared ?? [];
      const ids = [input.messageId, ...shared.map((c) => c.id)];
      const known = conversationMessages(db, req.user.id, req.partner.id, ids);
      if (!known.has(input.messageId)) return sendError(res, 404, 'not_found', 'No such message.');
      // Only messages this member sent or received in this conversation can be shared.
      if (shared.some((c) => !known.has(c.id))) {
        return sendError(
          res,
          400,
          'not_in_conversation',
          'Only messages of this conversation can be shared.'
        );
      }
      const copies = shared.map((c) => ({ ...c, ...known.get(c.id) }));
      const reportId = createDirectReport(db, {
        reporterId: req.user.id,
        partnerId: req.partner.id,
        messageId: input.messageId,
        reason: input.reason,
        copies,
      });
      audit(req, 'chat.direct_report', reportId, { shared: copies.length });
      // The id: the reporter's browser then adds shared messages' files (directFiles/).
      res.status(201).json({ ok: true, reportId });
    }
  );

  const loadReport = loadById((id) => findDirectReport(db, id), 'report', 'report');

  moderator.get('/', allow('organiser'), (_req, res) => {
    res.json({ ok: true, reports: listDirectReports(db) });
  });

  // Every view of shared copies is audited: who looked at which report, and when.
  moderator.get('/:id/copies', allow('organiser'), loadReport, (req, res) => {
    const copies = reportCopies(db, req.report.id);
    audit(req, 'chat.direct_report_view', req.report.id, { copies: copies.length });
    res.json({ ok: true, copies });
  });

  moderator.post('/:id/reviewed', allow('organiser'), loadReport, (req, res) => {
    markDirectReportReviewed(db, req.report.id, req.user.username);
    audit(req, 'chat.direct_report_review', req.report.id, null);
    res.json({ ok: true });
  });

  return { member, moderator };
}
