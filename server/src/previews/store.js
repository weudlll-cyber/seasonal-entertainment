// ============================================================
// File:        store.js
// Path:        server/src/previews/store.js
// Project:     Seasonal Entertainment
// Description: Data access for link previews: the cached row for a URL, saving a fetch result
//              (a failed fetch is cached too, so a broken link is not fetched again and again),
//              attaching a preview to a message or removing it, and finding rows no message
//              uses any more.
// ============================================================

const COLUMNS = `id, url, fetched_at AS fetchedAt, ok, title, description, site_name AS siteName,
  image_file AS imageFile, image_width AS imageWidth, image_height AS imageHeight`;

const toPreview = (row) => row && { ...row, ok: row.ok === 1 };

export function findPreview(db, url) {
  return toPreview(db.prepare(`SELECT ${COLUMNS} FROM link_previews WHERE url = ?`).get(url));
}

// data: { title, description, siteName, image: { file, width, height } | null } or null for a
// failed fetch. Returns { preview, oldFile } (oldFile: the replaced image, to delete).
export function savePreview(db, url, data, now = new Date()) {
  const oldFile = findPreview(db, url)?.imageFile ?? null;
  const image = data?.image ?? null;
  db.prepare(
    `INSERT INTO link_previews
       (url, fetched_at, ok, title, description, site_name, image_file, image_width, image_height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (url) DO UPDATE SET fetched_at = excluded.fetched_at, ok = excluded.ok,
       title = excluded.title, description = excluded.description,
       site_name = excluded.site_name, image_file = excluded.image_file,
       image_width = excluded.image_width, image_height = excluded.image_height`
  ).run(
    url,
    now.toISOString(),
    data ? 1 : 0,
    data?.title ?? null,
    data?.description ?? null,
    data?.siteName ?? null,
    image?.file ?? null,
    image?.width ?? null,
    image?.height ?? null
  );
  const preview = findPreview(db, url);
  return { preview, oldFile: oldFile !== preview.imageFile ? oldFile : null };
}

export function setMessagePreview(db, messageId, previewId) {
  db.prepare('UPDATE chat_messages SET preview_id = ? WHERE id = ?').run(previewId, messageId);
}

// true when the message had a preview.
export function removeMessagePreview(db, messageId) {
  return (
    db
      .prepare('UPDATE chat_messages SET preview_id = NULL WHERE id = ? AND preview_id IS NOT NULL')
      .run(messageId).changes === 1
  );
}

// Rows fetched before `beforeIso` that no message uses: deleted; returns their image files.
export function deleteUnusedPreviews(db, beforeIso) {
  const unused = `FROM link_previews WHERE fetched_at < ?
    AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.preview_id = link_previews.id)`;
  return db.transaction(() => {
    const files = db
      .prepare(`SELECT image_file AS file ${unused} AND image_file IS NOT NULL`)
      .all(beforeIso)
      .map((row) => row.file);
    db.prepare(`DELETE ${unused}`).run(beforeIso);
    return files;
  })();
}
