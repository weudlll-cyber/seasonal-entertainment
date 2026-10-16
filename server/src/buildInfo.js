// ============================================================
// File:        buildInfo.js
// Path:        server/src/buildInfo.js
// Project:     Seasonal Entertainment
// Description: Resolves the version and commit reported by GET /api/health, once at start.
// ============================================================

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const rootPackageUrl = new URL('../../package.json', import.meta.url);

// COMMIT_SHA wins (CI, or a deploy without a .git folder); otherwise ask git; otherwise "unknown".
function resolveCommit(env) {
  if (env.COMMIT_SHA) return env.COMMIT_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function readBuildInfo(env = process.env) {
  const { version } = JSON.parse(readFileSync(rootPackageUrl, 'utf8'));
  return { version, commit: resolveCommit(env) };
}
