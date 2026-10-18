// ============================================================
// File:        addColumns.js
// Path:        server/src/db/addColumns.js
// Project:     Seasonal Entertainment
// Description: Brings older databases up: adds columns that were added to a table after it was
//              first created (CREATE TABLE IF NOT EXISTS skips them), each with an optional
//              statement that runs once, in the same transaction, right after the column is
//              added. Used by every area's migrate function.
// ============================================================

// columns: [table, column, definition, afterwards?]
export function addMissingColumns(db, columns) {
  for (const [table, column, definition, afterwards] of columns) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.some((c) => c.name === column)) continue;
    db.transaction(() => {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      if (afterwards) db.exec(afterwards);
    })();
  }
}
