// ============================================================
// File:        chatBoundary.test.js
// Path:        server/test/chatBoundary.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat area's server boundary (docs/CHAT.md): outside the chat area
//              only mountChat (chat/mount.js) is used, plus the table definitions the database
//              layer registers. Chat routes, hub, moderation, media, previews and uploads are
//              reached through that one call.
// ============================================================

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CHAT_AREA = ['chat', 'media', 'previews', 'uploads'].map((d) => path.join(srcDir, d));
const inArea = (file) => CHAT_AREA.some((dir) => file.startsWith(dir + path.sep));
const ALLOWED = (target) =>
  target === path.join(srcDir, 'chat', 'mount.js') || path.basename(target) === 'schema.js';

it('outside the chat area only mountChat and the table definitions are imported', () => {
  const reachingIn = [];
  const files = readdirSync(srcDir, { recursive: true })
    .map((name) => path.join(srcDir, name))
    .filter((file) => file.endsWith('.js') && !inArea(file));
  for (const file of files) {
    const specs = [...readFileSync(file, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
    for (const [, spec] of specs) {
      const target = path.resolve(path.dirname(file), spec);
      if (inArea(target) && !ALLOWED(target)) {
        reachingIn.push(`${path.relative(srcDir, file)} -> ${spec}`);
      }
    }
  }
  expect(reachingIn).toEqual([]);
});
