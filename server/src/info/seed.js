// ============================================================
// File:        seed.js
// Path:        server/src/info/seed.js
// Project:     Seasonal Entertainment
// Description: First-start content: when the info_pages table is empty, inserts the draft
//              pages from server/src/info/seed/<slug>.md (first line "# Title", the rest is the
//              Markdown body) in SEED_ORDER. All seeded pages are drafts: nobody sees them
//              until an admin reviews and publishes them. Never runs again once pages exist,
//              so later edits, renames and reorders are never undone.
// ============================================================

import { readFileSync } from 'node:fs';

export const SEED_ORDER = [
  'what-are-seasonal-tokens',
  'how-it-works',
  'mining',
  'farming',
  'charts-and-trading',
  'security-audits',
  'team',
  'official-channels',
  'risks',
  'faq',
  'imprint',
  'privacy',
];

export function readSeedPage(slug) {
  const text = readFileSync(new URL(`./seed/${slug}.md`, import.meta.url), 'utf8');
  const [first, ...rest] = text.split('\n');
  if (!first.startsWith('# ')) throw new Error(`seed page ${slug} must start with "# Title"`);
  return { slug, title: first.slice(2).trim(), body: rest.join('\n').trim() + '\n' };
}

export function seedInfoPages(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM info_pages').get().n > 0) return 0;
  const insert = db.prepare(
    "INSERT INTO info_pages (slug, title, body, status, position, updated_by_name) VALUES (?, ?, ?, 'draft', ?, 'seed')"
  );
  db.transaction(() => {
    SEED_ORDER.forEach((slug, index) => {
      const page = readSeedPage(slug);
      insert.run(page.slug, page.title, page.body, index + 1);
    });
  })();
  return SEED_ORDER.length;
}
