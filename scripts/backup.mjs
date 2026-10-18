// ============================================================
// File:        backup.mjs
// Path:        scripts/backup.mjs
// Project:     Seasonal Entertainment
// Description: `node scripts/backup.mjs`: one consistent backup of the database and the media
//              folder into BACKUP_DIR (server/src/backup/backup.js), deleting backups older than
//              14 days. Reads DATABASE_PATH and MEDIA_DIR like the server (.env if present).
//              In production it runs inside the site container, nightly, from a systemd timer
//              (docs/DEPLOYMENT.md, "Backups"). Exit code 1 when it failed.
// ============================================================

import { existsSync } from 'node:fs';
import { makeBackup } from '../server/src/backup/backup.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const backupRoot = process.env.BACKUP_DIR;
if (!backupRoot) {
  console.error('[backup] BACKUP_DIR is not set: where should the backup go?');
  process.exit(1);
}
const { databasePath, mediaDir } = readConfig();
try {
  const { dir, manifest, pruned } = await makeBackup({ databasePath, mediaDir, backupRoot });
  console.log(
    `[backup] ${dir}: database ${manifest.database.sha256.slice(0, 12)}…, ` +
      `${manifest.media.files} media files; removed ${pruned.length} old backups`
  );
} catch (error) {
  console.error(`[backup] FAILED: ${error.message}`);
  process.exit(1);
}
