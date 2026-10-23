// ============================================================
// File:        infoSeed.test.js
// Path:        server/test/infoSeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the first-start info pages: inserted only into an empty table, the ten
//              content pages and the Disclaimer published and the two legal pages as drafts (invisible to the
//              public), and the content rules: every source-based page
//              ends with a Sources list, no contract address is retyped, no raw HTML or local
//              file links, Risks says "not financial advice", legal pages carry placeholders,
//              the privacy draft says when calls are recorded (only after an organiser starts
//              it, always announced) and what the call server processes, and its recording
//              section is a proposal for the owner (consent as legal basis, no automatic
//              deletion, the rights and where to complain) with only the contact left to fill.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { SEED_DRAFTS, SEED_ORDER, readSeedPage, seedInfoPages } from '../src/info/seed.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const LEGAL = ['imprint', 'privacy'];
const CONTENT = [
  'what-are-seasonal-tokens',
  'how-it-works',
  'mining',
  'farming',
  'charts-and-trading',
  'faq',
  'risks',
  'security-audits',
  'team',
  'official-channels',
  'disclaimer',
];

describe('seeding', () => {
  it('fills an empty table once: the content pages and the Disclaimer published, the legal two drafts', async () => {
    t = makeTestApp();
    expect(seedInfoPages(t.db)).toBe(SEED_ORDER.length);
    expect(seedInfoPages(t.db)).toBe(0);
    expect([...SEED_DRAFTS].sort()).toEqual(LEGAL);
    const slugs = (status) =>
      t.db
        .prepare('SELECT slug FROM info_pages WHERE status = ? ORDER BY slug')
        .all(status)
        .map((r) => r.slug);
    expect(slugs('published')).toEqual([...CONTENT].sort());
    expect(slugs('draft')).toEqual(LEGAL);
    const shown = (await t.client().get('/api/info')).body.pages.map((p) => p.slug);
    expect(shown.sort()).toEqual([...CONTENT].sort());
    expect((await t.client().get('/api/info/faq')).status).toBe(200);
    expect((await t.client().get('/api/info/privacy')).status).toBe(404);
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

it('the Disclaimer says what the site is not, and links the official disclaimer', () => {
  const { body } = readSeedPage('disclaimer');
  expect(body).toMatch(/not financial, investment, legal or tax advice/);
  expect(body).toMatch(/Nothing here is a recommendation to buy, sell or hold any token/);
  expect(body).toMatch(/you can lose money/);
  expect(body).toMatch(/does not sell tokens/);
  expect(body).toContain('(https://seasonaltokens.org/legal#disclaimer)');
});

it('the privacy draft says when calls are recorded and what the call server processes', () => {
  const { body } = readSeedPage('privacy');
  expect(body).toContain('a call is **not recorded** unless an organiser starts a recording');
  expect(body).toContain('**Call recordings**');
  expect(body).toContain('I understand this call is being recorded');
  expect(body).toMatch(/IP addresses of everyone connected/);
});

it('the privacy draft proposes the recording terms, leaving only the contact to fill', () => {
  const { body } = readSeedPage('privacy');
  const start = body.indexOf('- **Call recordings**');
  // Up to the next item of the list.
  const section = body.slice(start, body.indexOf('\n- **', start + 1));
  expect(section).toContain('Proposal — to be reviewed by the site owner');
  expect(section).toMatch(/\*\*Legal basis\*\*: your consent \(GDPR Art\. 6\(1\)\(a\)\)/);
  expect(section).toMatch(/There is no\s+automatic deletion/);
  expect(section).toContain('Datenschutzbehörde');
  expect(section.match(/\[TO BE FILLED BY OWNER/g)).toEqual(['[TO BE FILLED BY OWNER']);
  expect(section).toContain('[TO BE FILLED BY OWNER: contact email');
});
