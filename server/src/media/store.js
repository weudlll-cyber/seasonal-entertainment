// ============================================================
// File:        store.js
// Path:        server/src/media/store.js
// Project:     Seasonal Entertainment
// Description: Data access for the chat media library: packs and items, the full list for the
//              admin page, the active list for the picker, and the check whether an item may
//              be sent (active, in an active pack of the right kind).
// ============================================================

import { mediaUrl } from './files.js';

const now = () => new Date().toISOString();
const PACK_COLUMNS = 'id, name, kind, position, active';
const ITEM_COLUMNS = `id, pack_id AS packId, name, alt, credit, file, mime, width, height, bytes,
  position, active`;

const toPack = (row) => row && { ...row, active: row.active === 1 };
// What the client gets: the file only as a URL on this site.
const toItem = (row) => {
  if (!row) return row;
  const { file, ...item } = row;
  return { ...item, active: item.active === 1, url: mediaUrl(file) };
};

// --- packs ---------------------------------------------------------------------------
export function countPacks(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM media_packs').get().n;
}

export function findPack(db, id) {
  return toPack(db.prepare(`SELECT ${PACK_COLUMNS} FROM media_packs WHERE id = ?`).get(id));
}

// Packs in order, each with its items in order. activeOnly: what the picker may offer.
export function listLibrary(db, { activeOnly = false } = {}) {
  const only = activeOnly ? 'WHERE active = 1' : '';
  const packs = db
    .prepare(`SELECT ${PACK_COLUMNS} FROM media_packs ${only} ORDER BY position, id`)
    .all()
    .map(toPack);
  const items = db.prepare(
    `SELECT ${ITEM_COLUMNS} FROM media_items WHERE pack_id = ? ${activeOnly ? 'AND active = 1' : ''}
     ORDER BY position, id`
  );
  return packs.map((pack) => ({ ...pack, items: items.all(pack.id).map(toItem) }));
}

export function createPack(db, { name, kind }) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO media_packs (name, kind, position)
       VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM media_packs))`
    )
    .run(name, kind);
  return findPack(db, Number(lastInsertRowid));
}

export function updatePack(db, id, { name, active }) {
  db.prepare('UPDATE media_packs SET name = ?, active = ? WHERE id = ?').run(
    name,
    active ? 1 : 0,
    id
  );
  return findPack(db, id);
}

export function reorderPacks(db, ids) {
  const set = db.prepare('UPDATE media_packs SET position = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => set.run(index + 1, id)))();
}

// --- items ---------------------------------------------------------------------------
export function findItem(db, id) {
  return db.prepare(`SELECT ${ITEM_COLUMNS} FROM media_items WHERE id = ?`).get(id);
}

export const publicItem = toItem;

// image: the checked image ({ mime, width, height }); file: its generated name on disk.
export function addItem(db, packId, { name, alt, credit }, image, file, bytes) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO media_items
         (pack_id, name, alt, credit, file, mime, width, height, bytes, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT COALESCE(MAX(position), 0) + 1 FROM media_items WHERE pack_id = ?), ?)`
    )
    .run(
      packId,
      name,
      alt,
      credit || null,
      file,
      image.mime,
      image.width,
      image.height,
      bytes,
      packId,
      now()
    );
  return findItem(db, Number(lastInsertRowid));
}

export function updateItem(db, id, { name, alt, credit, active }) {
  db.prepare('UPDATE media_items SET name = ?, alt = ?, credit = ?, active = ? WHERE id = ?').run(
    name,
    alt,
    credit || null,
    active ? 1 : 0,
    id
  );
  return findItem(db, id);
}

export function deleteItem(db, id) {
  db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
}

// The item a sticker/GIF message may use: active, in an active pack of that kind.
export function findSendableItem(db, id, kind) {
  return db
    .prepare(
      `SELECT i.id FROM media_items i JOIN media_packs p ON p.id = i.pack_id
       WHERE i.id = ? AND i.active = 1 AND p.active = 1 AND p.kind = ?`
    )
    .get(id, kind);
}
