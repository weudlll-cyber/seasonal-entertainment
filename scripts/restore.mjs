// ============================================================
// File:        restore.mjs
// Path:        scripts/restore.mjs
// Project:     Seasonal Entertainment
// Description: `node scripts/restore.mjs <backup folder> [--force]`: checks one backup
//              (checksum, SQLite integrity, media count) and puts it back to DATABASE_PATH and
//              MEDIA_DIR (server/src/backup/restore.js). Existing data is refused without
//              --force; with it, it is moved aside, never deleted. Stop the site first
//              (docs/DEPLOYMENT.md, "Restoring"). `--check` only verifies the backup.
// ============================================================

import { existsSync } from 'node:fs';
import { restoreBackup, verifyBackup } from '../server/src/backup/restore.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const args = process.argv.slice(2);
const backupDir = args.find((arg) => !arg.startsWith('--'));
if (!backupDir) {
  console.error('usage: node scripts/restore.mjs <backup folder> [--force | --check]');
  process.exit(1);
}
try {
  if (args.includes('--check')) {
    const manifest = verifyBackup(backupDir);
    console.log(`[restore] ${backupDir} is sound (made ${manifest.createdAt})`);
  } else {
    const { databasePath, mediaDir } = readConfig();
    const force = args.includes('--force');
    const { manifest, movedAside } = restoreBackup({ backupDir, databasePath, mediaDir, force });
    console.log(`[restore] restored the backup of ${manifest.createdAt} to ${databasePath}`);
    for (const old of movedAside) console.log(`[restore] the previous data is kept as ${old}`);
  }
} catch (error) {
  console.error(`[restore] FAILED: ${error.message}`);
  process.exit(1);
}
