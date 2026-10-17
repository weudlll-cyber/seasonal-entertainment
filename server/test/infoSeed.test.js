// ============================================================
// File:        infoSeed.test.js
// Path:        server/test/infoSeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the first-start info pages: inserted only into an empty table, all as
//              drafts (invisible to the public), and the content rules: every source-based page
//              ends with a Sources list, no contract address is retyped, no raw HTML or local
//              file links, Risks says "not financial advice", legal pages carry placeholders.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { SEED_ORDER, readSeedPage, seedInfoPages } from '../src/info/seed.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const LEGAL = ['imprint', 'privacy'];

describe('seeding', () => {
  it('fills an empty table once, with drafts only', async () => {
    t = makeTestApp();
    expect(seedInfoPages(t.db)).toBe(SEED_ORDER.length);
    expect(seedInfoPages(t.db)).toBe(0);
    const statuses = t.db.prepare('SELECT DISTINCT status FROM info_pages').all();
    expect(statuses).toEqual([{ status: 'draft' }]);
    expect((await t.client().get('/api/info')).body.pages).toEqual([]);
    expect((await t.client().get('/api/info/faq')).status).toBe(404);
  });
});

describe.each(SEED_ORDER)('seed page %s', (slug) => {
  const page = readSeedPage(slug);

  it('has a title and a body', () => {
    expect(page.title.length).toBeGreaterThan(2);
    expect(page.body.length).toBeGreaterThan(100);
  });

  it('retypes no contract address, uses no raw HTML and no local file links', () => {
    expect(page.body).not.toMatch(/0x[0-9a-fA-F]{6,}/);
    expect(page.body).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(page.body).not.toMatch(/file:\/\//i);
  });

  if (LEGAL.includes(slug)) {
    it('is marked for legal review and has owner placeholders', () => {
      expect(page.body).toContain('needs legal review');
      expect(page.body).toContain('[TO BE FILLED BY OWNER');
    });
  } else {
    it('ends with a Sources list', () => {
      const sources = page.body.slice(page.body.lastIndexOf('## Sources'));
      expect(page.body).toContain('## Sources');
      expect(sources.split('\n').filter((line) => line.startsWith('- ')).length).toBeGreaterThan(0);
    });
  }
});

it('the Risks page says "not financial advice"', () => {
  expect(readSeedPage('risks').body).toMatch(/not financial advice/i);
});
