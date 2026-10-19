// ============================================================
// File:        restore.mjs
// Path:        scripts/restore.mjs
// Project:     Seasonal Entertainment
// Description: `node scripts/restore.mjs <backup folder or .tar> [--force | --check]`: checks
//              one backup (checksum, SQLite integrity, media count) and puts it back to
//              DATABASE_PATH and MEDIA_DIR (server/src/backup/restore.js). A .tar is an
//              encrypted backup already decrypted on the owner's PC (archive.js unpacks it).
//              Existing data is refused without --force; with it, it is moved aside, never
//              deleted. Stop the site first (docs/DEPLOYMENT.md, "Restoring"). `--check` only
//              verifies the backup.
// ============================================================

import { existsSync } from 'node:fs';
import { openBackup } from '../server/src/backup/archive.js';
import { restoreBackup, verifyBackup } from '../server/src/backup/restore.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const args = process.argv.slice(2);
const source = args.find((arg) => !arg.startsWith('--'));
if (!source) {
  console.error('usage: node scripts/restore.mjs <backup folder or .tar> [--force | --check]');
  process.exit(1);
}
let opened = null;
try {
  opened = openBackup(source);
  const backupDir = opened.dir;
  if (args.includes('--check')) {
    const manifest = verifyBackup(backupDir);
    console.log(`[restore] ${source} is sound (made ${manifest.createdAt})`);
  } else {
    const { databasePath, mediaDir } = readConfig();
    const force = args.includes('--force');
    const { manifest, movedAside } = restoreBackup({ backupDir, databasePath, mediaDir, force });
    console.log(`[restore] restored the backup of ${manifest.createdAt} to ${databasePath}`);
    for (const old of movedAside) console.log(`[restore] the previous data is kept as ${old}`);
  }
} catch (error) {
  console.error(`[restore] FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  opened?.cleanup();
}
