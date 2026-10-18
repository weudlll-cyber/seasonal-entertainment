// ============================================================
// File:        like.js
// Path:        server/src/db/like.js
// Project:     Seasonal Entertainment
// Description: Searching with SQL LIKE: typed "%", "_" and "\" must match themselves, not act as
//              wildcards. Use with ESCAPE '\' in the statement.
// ============================================================

export const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
