// ============================================================
// File:        bodies.js
// Path:        server/src/http/bodies.js
// Project:     Seasonal Entertainment
// Description: The request body parsers every route uses: JSON (app.js) and raw files (uploads,
//              direct files, media and step icons). None inflates a compressed body: no client of
//              this site sends one, and refusing it (415) closes the decompression path for good
//              (body-parser's DoS by trailing bytes after a compressed body, GHSA-27r3-jxmh-p828,
//              2026-11-04; and any decompression bomb).
// ============================================================

import express from 'express';

export const jsonBody = (limit) => express.json({ limit, inflate: false });

// Any content type: the routes look at the bytes themselves.
export const rawBody = (limit) => express.raw({ type: () => true, limit, inflate: false });
