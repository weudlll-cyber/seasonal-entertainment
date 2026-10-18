// ============================================================
// File:        envExample.test.js
// Path:        server/test/envExample.test.js
// Project:     Seasonal Entertainment
// Description: Guards .env.example: every environment key the server reads (config.js,
//              buildInfo.js) is listed there by name, with an empty value.
// ============================================================

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

it('.env.example lists every key the server reads, without values', () => {
  const sources = read('../src/config.js') + read('../src/buildInfo.js');
  const keys = new Set([
    ...[...sources.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]),
    ...[...sources.matchAll(/read(?:Int|Bool)\(env, '([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]),
  ]);
  const listed = new Map(
    read('../../.env.example')
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.split('='))
  );
  expect(keys.size).toBeGreaterThan(10);
  expect([...keys].filter((key) => !listed.has(key))).toEqual([]);
  expect([...listed].filter(([, value]) => value !== '')).toEqual([]);
});
