// ============================================================
// File:        chatModule.test.js
// Path:        client/src/chat/chatModule.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat module's boundary (docs/CHAT.md): its files import nothing from
//              outside the folder except the documented inputs, and the rest of the client uses
//              it only through index.js.
// ============================================================

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.dirname(moduleDir);

// What the module may use from outside: React, the shared chat rules, the account context
// and the site's API client. Nothing from pages, layout or other components.
const ALLOWED_OUTSIDE = new Set([
  'react',
  '@seasonal-entertainment/shared/chatRules.js',
  // Direct messages are encrypted and decrypted in the browser (docs/CHAT.md).
  '@seasonal-entertainment/shared/crypto.js',
  '@seasonal-entertainment/shared/cryptoFormat.js',
  path.join(srcDir, 'session', 'SessionContext.jsx'),
  path.join(srcDir, 'api', 'http.js'),
]);

const importsOf = (file) =>
  [...readFileSync(file, 'utf8').matchAll(/^import\s(?:[^'"]*\sfrom\s)?['"]([^'"]+)['"]/gm)].map(
    (m) => m[1]
  );

const sourceFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((name) => path.join(dir, name))
    .filter((file) => /\.(js|jsx)$/.test(file) && !/\.test\.(js|jsx)$/.test(file));

describe('chat module boundary', () => {
  it('imports only the documented inputs from outside its folder', () => {
    const forbidden = [];
    for (const file of sourceFiles(moduleDir)) {
      for (const spec of importsOf(file)) {
        const target = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : spec;
        const inside = target.startsWith(moduleDir + path.sep);
        if (!inside && !ALLOWED_OUTSIDE.has(target)) {
          forbidden.push(`${path.relative(srcDir, file)} -> ${spec}`);
        }
      }
    }
    expect(forbidden).toEqual([]);
  });

  it('the rest of the client uses only index.js', () => {
    const entry = path.join(moduleDir, 'index.js');
    const reachingIn = [];
    for (const file of sourceFiles(srcDir).filter((f) => !f.startsWith(moduleDir + path.sep))) {
      for (const spec of importsOf(file).filter((s) => s.startsWith('.'))) {
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(moduleDir + path.sep) && target !== entry) {
          reachingIn.push(`${path.relative(srcDir, file)} -> ${spec}`);
        }
      }
    }
    expect(reachingIn).toEqual([]);
  });
});
