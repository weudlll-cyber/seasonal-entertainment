// ============================================================
// File:        infoSeed.test.js
// Path:        server/test/infoSeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the first-start info pages: inserted only into an empty table, the ten
//              content pages and the Disclaimer published and the two legal pages as drafts
//              (invisible to the public), and the content rules: every source-based page ends with
//              a Sources list, no contract address is retyped, no raw HTML or local file links,
//              Risks says "not financial advice", legal pages say "Fill in before going live" and
//              carry placeholders, the privacy draft
//              describes the Discord login (what it stores and for how long), the privacy draft
//              says when calls are recorded (only after an organiser starts it, always announced)
//              and what the call server processes, and its recording section is a proposal for the
//              owner (consent as legal basis, no automatic deletion, the rights and where to
//              complain) with only the contact left to fill; it describes account deletion
//              (what goes, what stays, how long backups keep it) and what web push stores per
//              device, for what, and how it is removed. A stored page still holding an earlier
//              seed text gets the current one on start (Imprint and Privacy from before "Fill in
//              before going live", Privacy from before member profiles and from before web push
//              too); an edited one is left alone.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import {
  SEED_DRAFTS,
  SEED_ORDER,
  earlierSeeds,
  readSeedPage,
  refreshSeedPages,
  seedInfoPages,
  sha256,
} from '../src/info/seed.js';
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
    it('is marked to fill in before going live and has owner placeholders', () => {
      expect(page.body).toContain('**Fill in before going live.**');
      expect(page.body).not.toContain('legal review');
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

it('the privacy draft says what the Discord login stores, why, for how long, and what not', () => {
  const { body } = readSeedPage('privacy');
  const start = body.indexOf('- **Discord login**');
  const section = body.slice(start, body.indexOf('\n- **', start + 1));
  expect(section).toMatch(/Discord user\s+id and Discord username/);
  expect(section).toMatch(/ids of your roles on the Seasonal Tokens Discord server/);
  expect(section).toMatch(/"refresh token"[\s\S]*encrypted/);
  expect(section).toMatch(/does not read or store\s+your email address/);
  expect(section).toMatch(/unlink Discord[\s\S]*delete\s+your account/);
  // And the deletion list names the link.
  expect(body).toMatch(/your Discord link \(your Discord id and name/);
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

it('the privacy draft describes account deletion: what goes, what stays, the backups', () => {
  const { body } = readSeedPage('privacy');
  const start = body.indexOf('## Deleting your account');
  const section = body.slice(start, body.indexOf('\n## ', start + 1));
  expect(start).toBeGreaterThan(0);
  expect(section).toContain('"Delete my account"');
  expect(section).toContain('The last remaining admin account cannot be deleted');
  expect(section).toMatch(/whole conversation\s+is deleted for the other member too/);
  expect(section).toMatch(/admin and moderation log/);
  expect(section).toMatch(/call recordings/);
  // The real retention of the backups (server/src/backup/backup.js, docs/DEPLOYMENT.md).
  expect(section).toContain('**14 days**');
  expect(section).toContain('**newest 30 backups**');
});

it('the privacy draft says what web push stores per device, for what, and how it is removed', () => {
  const { body } = readSeedPage('privacy');
  const start = body.indexOf('- **Notifications when a call starts**');
  const entry = body.slice(start, body.indexOf('\n- **', start + 1));
  expect(start).toBeGreaterThan(0);
  // What (push/schema.js), for what, through whom (push/send.js).
  expect(entry).toMatch(/address your browser's push\s+service gave it, two keys/);
  expect(entry).toMatch(/Used only to send the call's\s+title with "has started"/);
  expect(entry).toMatch(/push service[\s\S]*cannot read it/);
  // Every way it goes (push/store.js; deleting the account cascades).
  expect(entry).toMatch(/turn the switch off on that device/);
  expect(entry).toMatch(/no longer valid/);
  expect(entry).toMatch(/account is locked, and with your account/);
  expect(body.slice(body.indexOf('## Deleting your account'))).toMatch(
    /devices you turned "When a call starts" on for/
  );
});

describe('refreshing unedited seed pages', () => {
  const OLD = 'An earlier seed text.\n';
  const privacyRow = () =>
    t.db.prepare("SELECT title, body, status FROM info_pages WHERE slug = 'privacy'").get();
  const setPrivacyBody = (body) =>
    t.db.prepare("UPDATE info_pages SET body = ? WHERE slug = 'privacy'").run(body);

  it('gives a page still holding an earlier seed text the current one, once', () => {
    t = makeTestApp();
    seedInfoPages(t.db);
    setPrivacyBody(OLD);
    expect(refreshSeedPages(t.db, { privacy: [sha256(OLD)] })).toBe(1);
    expect(privacyRow()).toEqual({
      title: 'Privacy',
      body: readSeedPage('privacy').body,
      status: 'draft',
    });
    expect(refreshSeedPages(t.db, { privacy: [sha256(OLD)] })).toBe(0);
  });

  it('leaves an edited page alone', () => {
    t = makeTestApp();
    seedInfoPages(t.db);
    setPrivacyBody(`${OLD}Edited by an admin.\n`);
    expect(refreshSeedPages(t.db, { privacy: [sha256(OLD)] })).toBe(0);
    expect(privacyRow().body).toBe(`${OLD}Edited by an admin.\n`);
    // And so does the real list: the current seed text is not an earlier one.
    setPrivacyBody(readSeedPage('privacy').body);
    expect(refreshSeedPages(t.db)).toBe(0);
  });

  // What a seed page gained since 2026-11-04: the privacy page's "Your profile" (2026-11-11),
  // its web push entry and that line in the account deletion list (2026-11-13).
  const between = (from, to) => {
    const body = readSeedPage('privacy').body;
    const start = body.indexOf(from);
    return body.slice(start, body.indexOf(to, start));
  };
  const profileEntry = () => between('- **Your profile**', '- **Discord login**');
  const pushEntry = () =>
    between('- **Notifications when a call starts**', '- **Protection against abuse**');
  const PUSH_DELETED =
    ';\n- the devices you turned "When a call starts" on for (their push addresses and keys).';
  const withoutPush = () =>
    readSeedPage('privacy').body.replace(pushEntry(), '').replace(PUSH_DELETED, '.');
  const withoutLater = (slug) =>
    slug === 'privacy' ? withoutPush().replace(profileEntry(), '') : readSeedPage(slug).body;
  // The texts before 2026-11-04, as a site seeded then still holds them where nobody edited them.
  const beforeFillIn = (slug) =>
    withoutLater(slug).replace(
      '**Fill in before going live.**',
      '**Draft — needs legal review before publishing.**'
    );

  it('gives a never-edited privacy from before member profiles the current text', () => {
    t = makeTestApp();
    seedInfoPages(t.db);
    t.db
      .prepare("UPDATE info_pages SET body = ? WHERE slug = 'privacy'")
      .run(withoutLater('privacy'));
    expect(profileEntry()).toMatch(/only to signed-in members/);
    expect(refreshSeedPages(t.db)).toBe(1);
    expect(t.db.prepare("SELECT body FROM info_pages WHERE slug = 'privacy'").get().body).toBe(
      readSeedPage('privacy').body
    );
  });

  it('gives a never-edited privacy from before web push the current text', () => {
    t = makeTestApp();
    seedInfoPages(t.db);
    expect(readSeedPage('privacy').body).toContain(PUSH_DELETED);
    t.db.prepare("UPDATE info_pages SET body = ? WHERE slug = 'privacy'").run(withoutPush());
    expect(refreshSeedPages(t.db)).toBe(1);
    expect(t.db.prepare("SELECT body FROM info_pages WHERE slug = 'privacy'").get().body).toBe(
      readSeedPage('privacy').body
    );
  });

  it.each(['imprint', 'privacy'])(
    'gives a never-edited %s the "Fill in before going live" text; an edited one stays',
    (slug) => {
      t = makeTestApp();
      seedInfoPages(t.db);
      const row = () => t.db.prepare('SELECT body FROM info_pages WHERE slug = ?').get(slug);
      const setBody = (body) =>
        t.db.prepare('UPDATE info_pages SET body = ? WHERE slug = ?').run(body, slug);
      setBody(beforeFillIn(slug));
      expect(refreshSeedPages(t.db)).toBe(1);
      expect(row().body).toBe(readSeedPage(slug).body);
      // Filled in by the owner (as on the live site): never replaced.
      const filled = beforeFillIn(slug).replace('[TO BE FILLED BY OWNER', '[Jane Doe');
      setBody(filled);
      expect(refreshSeedPages(t.db)).toBe(0);
      expect(row().body).toBe(filled);
    }
  );

  it('lists only seed pages, as SHA-256 hashes', () => {
    for (const [slug, hashes] of Object.entries(earlierSeeds())) {
      expect(SEED_ORDER).toContain(slug);
      for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const slug of ['imprint', 'privacy']) {
      expect(earlierSeeds()[slug]).not.toContain(sha256(readSeedPage(slug).body));
    }
  });
});
