// ============================================================
// File:        encrypted.js
// Path:        server/src/backup/encrypted.js
// Project:     Seasonal Entertainment
// Description: Encrypted backups (owner decision 2026-10-19: backups are kept on the owner's
//              PC; docs/DEPLOYMENT.md, "Backups to your PC"). The backup is made as before
//              (backup.js) in a temporary folder, packed with the system's tar and encrypted
//              with age (age-encryption, the age author's own implementation, pinned) to the
//              owner's public key. Only <UTC time>.tar.age reaches the backup folder: the server
//              never holds the private key, so it cannot read its own backups. The owner's PC
//              decrypts with the age tool; restore.js reads the decrypted .tar.
// ============================================================

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Encrypter } from 'age-encryption';
import { makeBackup, pruneBackups } from './backup.js';

export const ENCRYPTED_SUFFIX = '.tar.age';

// The owner's age public key ("age1…"). A private key here would be a serious mistake: it must
// stay on the owner's PC, so it is refused with that message.
export function checkRecipient(recipient) {
  if (typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('BACKUP_RECIPIENT is not set: the age public key (age1…) of the owner');
  }
  if (/^AGE-SECRET-KEY-/i.test(recipient.trim())) {
    throw new Error('BACKUP_RECIPIENT is a PRIVATE key: it must never be on the server');
  }
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient.trim()); // throws on anything that is not a public key
  return encrypter;
}

// tar of `name` inside `dir`, as a stream (GNU tar on the server, bsdtar on Windows).
function tarStream(dir, name) {
  const tar = spawn('tar', ['-cf', '-', '-C', dir, name], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  tar.stderr.on('data', (chunk) => (errors += chunk));
  const finished = new Promise((resolve, reject) => {
    tar.on('error', reject);
    tar.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar: ${errors.trim()}`))
    );
  });
  return { stream: tar.stdout, finished };
}

// Returns { file, manifest, pruned }: the encrypted backup and what the plain one held.
export async function makeEncryptedBackup({
  databasePath,
  mediaDir,
  backupRoot,
  recipient,
  now = new Date(),
}) {
  const encrypter = checkRecipient(recipient); // before anything is written
  mkdirSync(backupRoot, { recursive: true });
  const work = mkdtempSync(path.join(tmpdir(), 'se-backup-'));
  try {
    // The plain backup, checked as always, but in a folder only this run sees.
    const { dir, manifest } = await makeBackup({ databasePath, mediaDir, backupRoot: work, now });
    const name = path.basename(dir);
    const file = path.join(backupRoot, `${name}${ENCRYPTED_SUFFIX}`);
    const partial = `${file}.partial`;
    const tar = tarStream(work, name);
    const encrypted = await encrypter.encrypt(Readable.toWeb(tar.stream));
    await Promise.all([
      pipeline(Readable.fromWeb(encrypted), createWriteStream(partial)),
      tar.finished,
    ]);
    // Complete only now; older backups go only after a new one exists.
    renameSync(partial, file);
    return { file, manifest, pruned: pruneBackups(backupRoot, now) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
