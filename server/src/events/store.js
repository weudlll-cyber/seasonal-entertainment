// ============================================================
// File:        store.js
// Path:        server/src/events/store.js
// Project:     Seasonal Entertainment
// Description: Data access for events: active ones for the public, all for admins, and
//              create/update/delete.
// ============================================================

const COLUMNS = `id, title, description, rule, weekday, time_utc AS timeUtc,
  duration_minutes AS durationMinutes, channel, link, active`;
const ORDER = 'ORDER BY weekday, time_utc, id';

const toEvent = (row) => row && { ...row, active: row.active === 1 };

export function listActiveEvents(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM events WHERE active = 1 ${ORDER}`).all().map(toEvent);
}

export function listAllEvents(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM events ${ORDER}`).all().map(toEvent);
}

export function findEvent(db, id) {
  return toEvent(db.prepare(`SELECT ${COLUMNS} FROM events WHERE id = ?`).get(id));
}

const values = (e) => [
  e.title,
  e.description ?? '',
  e.rule,
  e.weekday,
  e.timeUtc,
  e.durationMinutes ?? null,
  e.channel ?? '',
  e.link ?? '',
  e.active === false ? 0 : 1,
];

export function createEvent(db, event) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO events (title, description, rule, weekday, time_utc, duration_minutes, channel, link, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(...values(event));
  return findEvent(db, Number(lastInsertRowid));
}

export function updateEvent(db, id, event) {
  db.prepare(
    `UPDATE events SET title = ?, description = ?, rule = ?, weekday = ?, time_utc = ?,
       duration_minutes = ?, channel = ?, link = ?, active = ? WHERE id = ?`
  ).run(...values(event), id);
  return findEvent(db, id);
}

export function deleteEvent(db, id) {
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
}
