// ============================================================
// File:        store.js
// Path:        server/src/info/store.js
// Project:     Seasonal Entertainment
// Description: Data access for info pages: public reads (published only), admin reads and
//              writes, and reordering.
// ============================================================

const COLUMNS = `id, slug, title, body, status, position, updated_by_name AS updatedBy,
  updated_at AS updatedAt`;
const now = () => new Date().toISOString();

export class DuplicateSlugError extends Error {}

export function listPublished(db) {
  return db
    .prepare("SELECT slug, title FROM info_pages WHERE status = 'published' ORDER BY position, id")
    .all();
}

export function findPublished(db, slug) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM info_pages WHERE slug = ? AND status = 'published'`)
    .get(slug);
}

export function listAll(db) {
  return db
    .prepare(
      `SELECT id, slug, title, status, position, updated_by_name AS updatedBy,
              updated_at AS updatedAt
       FROM info_pages ORDER BY position, id`
    )
    .all();
}

export function findById(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM info_pages WHERE id = ?`).get(id);
}

function unique(run) {
  try {
    return run();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new DuplicateSlugError();
    throw err;
  }
}

// New pages are drafts at the end of the list.
export function createPage(db, { slug, title, body }, editor) {
  return unique(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO info_pages (slug, title, body, position, updated_by_name, updated_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM info_pages), ?, ?)`
      )
      .run(slug, title, body, editor, now());
    return findById(db, Number(lastInsertRowid));
  });
}

export function updatePage(db, id, { slug, title, body }, editor) {
  unique(() =>
    db
      .prepare(
        'UPDATE info_pages SET slug = ?, title = ?, body = ?, updated_by_name = ?, updated_at = ? WHERE id = ?'
      )
      .run(slug, title, body, editor, now(), id)
  );
  return findById(db, id);
}

export function setStatus(db, id, status, editor) {
  db.prepare(
    'UPDATE info_pages SET status = ?, updated_by_name = ?, updated_at = ? WHERE id = ?'
  ).run(status, editor, now(), id);
}

// ids: every page id in the new order (the caller checks it is complete).
export function reorder(db, ids) {
  const set = db.prepare('UPDATE info_pages SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => set.run(index + 1, id)))();
}
