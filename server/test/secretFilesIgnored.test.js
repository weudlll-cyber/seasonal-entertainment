// ============================================================
// File:        secretFilesIgnored.test.js
// Path:        server/test/secretFilesIgnored.test.js
// Project:     Seasonal Entertainment
// Description: Guards .gitignore: the files that hold secrets or local data on a developer's
//              machine or the server (docs/DEPLOYMENT.md, docs/BOTS.md) can never be committed
//              by accident. Asks git itself (git check-ignore), so the real rules are tested.
// ============================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const ignored = (file) =>
  spawnSync('git', ['check-ignore', '--quiet', '--no-index', file], { cwd: repo }).status === 0;

it.each([
  '.env',
  'deploy/site/.env',
  'deploy/site/site.env',
  'deploy/site/docker-compose.override.yml',
  'deploy/calls/.env',
  'data/DEV-ADMIN.txt',
  'data/bot-fixtures/snapshots.db',
])('%s is never committed', (file) => {
  expect(ignored(file)).toBe(true);
});

it('the list of keys stays in the repository', () => {
  expect(ignored('.env.example')).toBe(false);
});
