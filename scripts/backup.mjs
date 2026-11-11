// ============================================================
// File:        backup.mjs
// Path:        scripts/backup.mjs
// Project:     Seasonal Entertainment
// Description: `node scripts/backup.mjs`: one consistent backup of the database and the media
//              folder into BACKUP_DIR, deleting backups older than 14 days. Encrypted by default
//              (decision rule of 2026-10-19, owner may change it): BACKUP_ENCRYPTION=on (the
//              default) needs BACKUP_RECIPIENT, the owner's age public key, and writes one
//              <UTC time>.tar.age (server/src/backup/encrypted.js); BACKUP_ENCRYPTION=off writes
//              a plain backup folder (backup.js). Reads DATABASE_PATH and MEDIA_DIR like the
//              server (.env if present). The archive leaves out the call recordings; right
//              after it, every finished recording without a backup is backed up once into
//              BACKUP_DIR/recordings/ (server/src/backup/recordings.js, decided 2026-11-11).
//              In production it runs inside the site container,
//              nightly, from a systemd timer (docs/DEPLOYMENT.md). Exit code 1 when it failed.
// ============================================================

import { existsSync } from 'node:fs';
import { makeBackup } from '../server/src/backup/backup.js';
import { makeEncryptedBackup } from '../server/src/backup/encrypted.js';
import { backupRecordings } from '../server/src/backup/recordings.js';
import { ENV_FILE, readConfig } from '../server/src/config.js';

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const { BACKUP_DIR: backupRoot, BACKUP_RECIPIENT: recipient } = process.env;
const encryption = process.env.BACKUP_ENCRYPTION || 'on';
const fail = (message) => {
  console.error(`[backup] FAILED: ${message}`);
  process.exit(1);
};
if (!backupRoot) fail('BACKUP_DIR is not set: where should the backup go?');
if (!['on', 'off'].includes(encryption)) fail('BACKUP_ENCRYPTION must be "on" or "off"');
const { databasePath, mediaDir } = readConfig();
try {
  const target = { databasePath, mediaDir, backupRoot };
  const made =
    encryption === 'on'
      ? await makeEncryptedBackup({ ...target, recipient })
      : await makeBackup(target);
  const { manifest, pruned } = made;
  console.log(
    `[backup] ${made.file ?? made.dir}${encryption === 'on' ? ' (encrypted)' : ' (NOT encrypted)'}: ` +
      `database ${manifest.database.sha256.slice(0, 12)}…, ${manifest.media.files} media files; ` +
      `removed ${pruned.length} old backups`
  );
  // Right after the archive, on the same timer: every finished recording backed up once
  // (server/src/backup/recordings.js), so none waits longer than the next nightly run.
  const recordings = await backupRecordings({
    ...target,
    recipient: encryption === 'on' ? recipient : null,
  });
  console.log(
    `[backup] recordings: ${recordings.added.length} new, ${recordings.again.length} again ` +
      `(changed), ${recordings.kept.length} kept, ${recordings.waiting.length} still recording, ` +
      `${recordings.pruned.length} removed (deleted on the site more than 14 days ago)`
  );
} catch (error) {
  fail(error.message);
}
