// ============================================================
// File:        recordings.js
// Path:        server/src/backup/recordings.js
// Project:     Seasonal Entertainment
// Description: The call recordings, backed up once each (docs/DEPLOYMENT.md, "Backups"; decided
//              2026-11-11): the nightly archive leaves out media/recordings (backup.js), and
//              this run, right after it on the same timer (scripts/backup.mjs), copies every
//              finished recording that has no backup yet into <backupRoot>/recordings/:
//              encrypted to the same age key as the archives (<file>.age; encrypted.js
//              checkRecipient), or as it is when backups are not encrypted. A recording still
//              being recorded (no stopped_at in the database) waits for the next run, so no
//              half-written file is kept. A backed-up file is not touched again, unless its
//              recording changed after its backup (the egress may finish writing a moment after
//              the stop): then it is backed up once more. A recording deleted on the site keeps
//              its backup for KEEP_DAYS: a "<backup>.gone" mark notes when it was first missed,
//              and the backup goes after that many days. Every file is written under a
//              ".partial" name and renamed when complete.
// ============================================================

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import { KEEP_DAYS } from './backup.js';
import { checkRecipient } from './encrypted.js';
import { RECORDINGS } from './files.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const AGE = '.age';
const GONE = '.gone';
const PARTIAL = '.partial';

// The files of recordings still being recorded (their row has no stopped_at yet).
function runningFiles(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'call_recordings'")
      .get();
    if (!table) return new Set();
    return new Set(
      db
        .prepare('SELECT file FROM call_recordings WHERE stopped_at IS NULL')
        .all()
        .map((r) => r.file)
    );
  } finally {
    db.close();
  }
}

// One recording into `target` (a .partial first): encrypted to the owner's key, or copied.
async function copyOne(source, target, recipient) {
  const partial = `${target}${PARTIAL}`;
  if (recipient === null) {
    copyFileSync(source, partial);
  } else {
    const encrypted = await checkRecipient(recipient).encrypt(
      Readable.toWeb(createReadStream(source))
    );
    await pipeline(Readable.fromWeb(encrypted), createWriteStream(partial));
  }
  renameSync(partial, target);
}

// recipient: the owner's age public key, or null when backups are not encrypted. Returns
// { added, again, kept, waiting, pruned }: file names backed up now for the first time, once
// more (changed since), already backed up, left for the next run (still recording), and the
// backups deleted (their recording gone for longer than keepDays).
export async function backupRecordings({
  databasePath,
  mediaDir,
  backupRoot,
  recipient,
  now = new Date(),
  keepDays = KEEP_DAYS,
}) {
  if (recipient !== null) checkRecipient(recipient); // before anything is written
  const source = path.join(mediaDir, RECORDINGS);
  const target = path.join(backupRoot, RECORDINGS);
  mkdirSync(target, { recursive: true });
  const suffix = recipient === null ? '' : AGE;
  const running = runningFiles(databasePath);
  const result = { added: [], again: [], kept: [], waiting: [], pruned: [] };

  // Leftovers of a run that stopped half-way.
  for (const name of readdirSync(target)) {
    if (name.endsWith(PARTIAL)) rmSync(path.join(target, name), { force: true });
  }

  const present = existsSync(source)
    ? readdirSync(source, { withFileTypes: true }).filter((e) => e.isFile())
    : [];
  for (const { name } of present) {
    if (running.has(name)) {
      result.waiting.push(name);
      continue;
    }
    const from = path.join(source, name);
    const to = path.join(target, `${name}${suffix}`);
    if (!existsSync(to)) {
      await copyOne(from, to, recipient);
      result.added.push(name);
    } else if (statSync(from).mtimeMs > statSync(to).mtimeMs) {
      // Written to after its backup: the backup may hold a file not yet complete.
      await copyOne(from, to, recipient);
      result.again.push(name);
    } else {
      result.kept.push(name);
    }
    rmSync(`${to}${GONE}`, { force: true }); // back on the site (a restore): no longer gone
  }

  // Backups whose recording is gone from the site: kept keepDays from when first missed.
  const sources = new Set(present.map((e) => e.name));
  for (const name of readdirSync(target)) {
    if (name.endsWith(GONE) || name.endsWith(PARTIAL)) continue;
    const recording = suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
    if (sources.has(recording)) continue;
    const mark = path.join(target, `${name}${GONE}`);
    if (!existsSync(mark)) {
      writeFileSync(mark, `${now.toISOString()}\n`);
    } else if (now - Date.parse(readFileSync(mark, 'utf8').trim()) > keepDays * DAY_MS) {
      rmSync(path.join(target, name), { force: true });
      rmSync(mark, { force: true });
      result.pruned.push(name);
    }
  }
  return result;
}
