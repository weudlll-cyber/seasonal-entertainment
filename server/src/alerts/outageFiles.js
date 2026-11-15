// ============================================================
// File:        outageFiles.js
// Path:        server/src/alerts/outageFiles.js
// Project:     Seasonal Entertainment
// Description: The files between the site and the host's outage watchdog (docs/DEPLOYMENT.md,
//              "An e-mail when the site is down"; decided 2026-11-14), in the site's data folder
//              (beside the database: the site-data volume, which the host reads while the site
//              is down). The site writes the recipient (the "Outage alert address" setting)
//              and, for "Send a test e-mail", the time it was asked; the watchdog
//              (deploy/site/watchdog/seasonal-watchdog.sh) writes back how that test went. The
//              site never holds the mail password: only the host sends.
// ============================================================

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ADDRESS_FILE = 'outage-alert-address';
export const REQUEST_FILE = 'outage-test-request';
export const RESULT_FILE = 'outage-test-result';

const inDataFolder = (config, name) => path.join(path.dirname(config.databasePath), name);

// Whole or not at all: the watchdog may read at any moment. Readable by the host's root.
function writeWhole(file, text) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, { mode: 0o644 });
  renameSync(tmp, file);
}

const readOr = (file, fallback) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
};

// The recipient, one line; '' switches the e-mails off.
export function writeOutageAddress(config, address) {
  writeWhole(inDataFolder(config, ADDRESS_FILE), address ? `${address}\n` : '');
}

// "Send a test e-mail": the watchdog's next run (at most 2 minutes) sends one. Returns the time.
export function requestTestMail(config, now = new Date()) {
  const at = now.toISOString();
  writeWhole(inDataFolder(config, REQUEST_FILE), `${at}\n`);
  return at;
}

// { requestedAt, result } for the admin page. result: null while the watchdog has not answered
// the newest request, else { sent: boolean, at, reason } (reason only for a failure). The
// watchdog's line: "sent <request> <at>" or "failed <request> <at> <reason>".
export function testMailState(config) {
  const requestedAt = readOr(inDataFolder(config, REQUEST_FILE), '').trim() || null;
  const line = readOr(inDataFolder(config, RESULT_FILE), '').trim();
  const [outcome, forRequest, at, ...reason] = line.split(' ');
  const answered = requestedAt && forRequest === requestedAt && /^(sent|failed)$/.test(outcome);
  return {
    requestedAt,
    result: answered
      ? { sent: outcome === 'sent', at, reason: outcome === 'failed' ? reason.join(' ') : null }
      : null,
  };
}
