// ============================================================
// File:        export-steps.mjs
// Path:        scripts/export-steps.mjs
// Project:     Seasonal Entertainment
// Description: `npm run steps:export`: writes a database's Discord steps into the seed the
//              project ships (server/src/discord/seed/steps.json, icons in seed/icons/), which a
//              site inserts once on its first start (server/src/discord/steps.js, seedSteps).
//              Reads the database read-only. Steps only: ladder, name, position, role id, icon;
//              never accounts, links, tokens or settings. By default the database and media
//              folder the server uses (DATABASE_PATH, MEDIA_DIR; .env as the server reads it);
//              --db, --media and --out choose others.
//              Usage: node scripts/export-steps.mjs [--db file] [--media dir] [--out dir]
// ============================================================

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { ENV_FILE, readConfig } from '../server/src/config.js';
import { LADDERS, STEP_SEED_FILE } from '../server/src/discord/steps.js';

const DESCRIPTION =
  "The Discord steps the site starts with (server/src/discord/steps.js, seedSteps): inserted once, into a database that never had a step, so admins' edits are never undone. Written from a database by scripts/export-steps.mjs (npm run steps:export); icons are the files in icons/ beside this one. Steps only: ladder, name, position (lowest first), Discord role id (or null) and icon file (or null). No accounts, tokens, client or server ids, nothing secret.";

// Returns { holder: n, farmer: n, investor: n }. outDir gets steps.json and icons/ (replaced).
export function exportSteps({ dbPath, mediaDir, outDir }) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  let rows;
  try {
    rows = db
      .prepare(
        `SELECT ladder, name, role_id AS roleId, icon_file AS iconFile FROM discord_steps
         ORDER BY CASE ladder WHEN 'holder' THEN 1 WHEN 'farmer' THEN 2 ELSE 3 END, position, id`
      )
      .all();
  } finally {
    db.close();
  }
  const iconDir = path.join(outDir, 'icons');
  // The old export's icons go: only the steps written now keep theirs.
  rmSync(iconDir, { recursive: true, force: true });
  mkdirSync(iconDir, { recursive: true });
  const counts = Object.fromEntries(LADDERS.map((ladder) => [ladder, 0]));
  const steps = rows.map(({ ladder, name, roleId, iconFile }) => {
    // Positions 1, 2, … per ladder: the order, without gaps left by removed steps.
    const position = (counts[ladder] += 1);
    let icon = null;
    if (iconFile) {
      icon = `${ladder}-${position}.webp`;
      copyFileSync(path.join(mediaDir, iconFile), path.join(iconDir, icon));
    }
    return { ladder, name, position, roleId, icon };
  });
  writeFileSync(
    path.join(outDir, 'steps.json'),
    `${JSON.stringify({ description: DESCRIPTION, steps }, null, 2)}\n`
  );
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string' }, media: { type: 'string' }, out: { type: 'string' } },
  });
  // Variables already set in the real environment win over the file, as for the server.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const config = readConfig();
  const outDir = values.out ?? fileURLToPath(new URL('.', STEP_SEED_FILE));
  const counts = exportSteps({
    dbPath: values.db ?? config.databasePath,
    mediaDir: values.media ?? config.mediaDir,
    outDir,
  });
  console.log(`Exported from ${values.db ?? config.databasePath} into ${outDir}:`);
  for (const [ladder, n] of Object.entries(counts)) console.log(`  ${ladder}: ${n} steps`);
}
