// ============================================================
// File:        previewParse.test.js
// Path:        server/test/previewParse.test.js
// Project:     Seasonal Entertainment
// Description: Guards how a preview is read from a page: Open Graph first, then Twitter card,
//              then <title> and description; plain text only (entities decoded, markup kept as
//              text, control characters gone), capped lengths, https image URLs only.
// ============================================================

import { describe, expect, it } from 'vitest';
import { parseMeta } from '../src/previews/parseMeta.js';

const LIMITS = { titleMax: 20, descriptionMax: 30, siteNameMax: 10 };
const parse = (head) =>
  parseMeta(`<html><head>${head}</head><body></body></html>`, 'https://site.test/a/b', LIMITS);

describe('parseMeta', () => {
  it('reads Open Graph', () => {
    expect(
      parse(`<meta property="og:title" content="ST news">
             <meta property="og:description" content="Halving soon">
             <meta property="og:site_name" content="Seasonal">
             <meta property="og:image" content="/img/card.png"><title>ignored</title>`)
    ).toEqual({
      title: 'ST news',
      description: 'Halving soon',
      siteName: 'Seasonal',
      image: 'https://site.test/img/card.png',
    });
  });

  it('falls back to Twitter card, then <title> and description', () => {
    expect(parse('<meta name="twitter:title" content="Tw"><title>T</title>').title).toBe('Tw');
    const plain = parse('<title> Just a\n title </title><meta name="description" content="D">');
    expect(plain).toMatchObject({ title: 'Just a title', description: 'D', image: null });
  });

  it('gives plain text: entities decoded, markup stays text, control characters gone', () => {
    const meta = parse(
      '<meta property="og:title" content="&lt;b&gt;Hi&lt;/b&gt; &amp; you"><meta property="og:description" content="a\u0007b">'
    );
    expect(meta.title).toBe('<b>Hi</b> & you');
    expect(meta.description).toBe('a b');
  });

  it('caps lengths and keeps only https images', () => {
    const meta = parse(
      `<meta property="og:title" content="${'x'.repeat(50)}"><meta property="og:image" content="http://site.test/i.png">`
    );
    expect(meta.title).toHaveLength(20);
    expect(meta.title.endsWith('…')).toBe(true);
    expect(meta.image).toBeNull();
    expect(parse('<meta property="og:image" content="javascript:alert(1)">').image).toBeNull();
  });
});
