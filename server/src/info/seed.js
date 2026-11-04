// ============================================================
// File:        seed.js
// Path:        server/src/info/seed.js
// Project:     Seasonal Entertainment
// Description: First-start content: when the info_pages table is empty, inserts the pages
//              from server/src/info/seed/<slug>.md (first line "# Title", the rest is the
//              Markdown body) in SEED_ORDER. The ten content pages are published (checked
//              against the official sources, decided 2026-10-22), and so is the Disclaimer
//              (linked as "Not financial advice" from every page, 2026-10-23); Imprint and Privacy
//              (SEED_DRAFTS) are drafts with placeholders, for an admin to fill in and publish.
//              Never runs again once pages exist, so later edits, renames and reorders are
//              never undone. One exception, refreshSeedPages(): a stored page whose body is still
//              exactly an earlier seed text (seed/earlier-seeds.json) was never edited, and gets
//              the current seed text on every start; an edited page is left alone.
// ============================================================

import { createHash } from 'node:crypto';
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
  'disclaimer',
  'imprint',
  'privacy',
];

// Seeded as drafts: nobody but admins sees them until one publishes them.
export const SEED_DRAFTS = new Set(['imprint', 'privacy']);

export function readSeedPage(slug) {
  const text = readFileSync(new URL(`./seed/${slug}.md`, import.meta.url), 'utf8');
  const [first, ...rest] = text.split('\n');
  if (!first.startsWith('# ')) throw new Error(`seed page ${slug} must start with "# Title"`);
  return { slug, title: first.slice(2).trim(), body: rest.join('\n').trim() + '\n' };
}

export function seedInfoPages(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM info_pages').get().n > 0) return 0;
  const insert = db.prepare(
    "INSERT INTO info_pages (slug, title, body, status, position, updated_by_name) VALUES (?, ?, ?, ?, ?, 'seed')"
  );
  db.transaction(() => {
    SEED_ORDER.forEach((slug, index) => {
      const page = readSeedPage(slug);
      const status = SEED_DRAFTS.has(slug) ? 'draft' : 'published';
      insert.run(page.slug, page.title, page.body, status, index + 1);
    });
  })();
  return SEED_ORDER.length;
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Seed pages with earlier texts: { slug: [SHA-256 of each earlier body] }.
export const earlierSeeds = () => {
  const { description: _about, ...bySlug } = JSON.parse(
    readFileSync(new URL('./seed/earlier-seeds.json', import.meta.url), 'utf8')
  );
  return bySlug;
};

// Returns how many pages got the current seed text. Status, title, order and slug stay.
// earlier: the hashes to match (tests hand in their own).
export function refreshSeedPages(db, earlier = earlierSeeds()) {
  const update = db.prepare(
    "UPDATE info_pages SET body = ?, updated_by_name = 'seed', updated_at = ? WHERE id = ?"
  );
  let refreshed = 0;
  for (const [slug, hashes] of Object.entries(earlier)) {
    const stored = db.prepare('SELECT id, body FROM info_pages WHERE slug = ?').get(slug);
    if (!stored || !hashes.includes(sha256(stored.body))) continue;
    update.run(readSeedPage(slug).body, new Date().toISOString(), stored.id);
    refreshed += 1;
  }
  return refreshed;
}
