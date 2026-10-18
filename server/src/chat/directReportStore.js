// ============================================================
// File:        directReportStore.js
// Path:        server/src/chat/directReportStore.js
// Project:     Seasonal Entertainment
// Description: Data access for reports of a private conversation (docs/CHAT.md, "Reporting a
//              direct message"): the reason and the fact, and — only when the reporter chose to
//              share them — copies of the selected messages, as the reporter provided them,
//              with each message's author and time as the server knows them. A moderator marks
//              a report reviewed; its copies are deleted 90 days later (retention.js).
// ============================================================

const now = () => new Date().toISOString();

// The messages of the conversation between the two members among `ids`: { id, authorName,
// sentAt } by id. An id outside the conversation is simply missing.
export function conversationMessages(db, me, partner, ids) {
  if (ids.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT d.id, u.username AS authorName, d.created_at AS sentAt
       FROM direct_messages d JOIN users u ON u.id = d.sender_id
       WHERE d.id IN (${ids.map(() => '?').join(',')})
         AND ((d.sender_id = ? AND d.recipient_id = ?) OR (d.sender_id = ? AND d.recipient_id = ?))`
    )
    .all(...ids, me, partner, partner, me);
  return new Map(rows.map((r) => [r.id, r]));
}

// copies: [{ id, text, mediaItemId?, authorName, sentAt }] (checked by the caller). Returns
// the new report's id.
export function createDirectReport(db, { reporterId, partnerId, messageId, reason, copies }) {
  return db.transaction(() => {
    const reportId = Number(
      db
        .prepare(
          `INSERT INTO direct_reports (reporter_id, partner_id, reported_message_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(reporterId, partnerId, messageId, reason, now()).lastInsertRowid
    );
    const insert = db.prepare(
      `INSERT INTO direct_report_copies
         (report_id, message_id, author_name, text, media_item_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const c of copies) {
      insert.run(reportId, c.id, c.authorName, c.text, c.mediaItemId ?? null, c.sentAt);
    }
    return reportId;
  })();
}

// Open reports, newest first: who reported whom, the reason, and how many copies were shared.
export function listDirectReports(db) {
  return db
    .prepare(
      `SELECT r.id, reporter.username AS reporter, partner.username AS partner, r.reason,
              r.created_at AS createdAt,
              (SELECT COUNT(*) FROM direct_report_copies c WHERE c.report_id = r.id) AS shared
       FROM direct_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users partner ON partner.id = r.partner_id
       WHERE r.reviewed_at IS NULL ORDER BY r.id DESC`
    )
    .all();
}

export function findDirectReport(db, id) {
  return db
    .prepare('SELECT id, reviewed_at AS reviewedAt FROM direct_reports WHERE id = ?')
    .get(id);
}

export function reportCopies(db, reportId) {
  return db
    .prepare(
      `SELECT message_id AS messageId, author_name AS author, text, media_item_id AS mediaItemId,
              sent_at AS sentAt
       FROM direct_report_copies WHERE report_id = ? ORDER BY message_id`
    )
    .all(reportId);
}

export function markDirectReportReviewed(db, id, moderator) {
  db.prepare(
    'UPDATE direct_reports SET reviewed_at = ?, reviewed_by = ? WHERE id = ? AND reviewed_at IS NULL'
  ).run(now(), moderator, id);
}
