// ============================================================
// File:        chatRules.test.js
// Path:        shared/chatRules.test.js
// Project:     Seasonal Entertainment
// Description: Guards the shared chat rules: link detection (what guests may not post),
//              splitting members' text into plain parts and https links (plain http never),
//              the first https link (previews), and message length.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX,
  containsLink,
  containsPlainHttpLink,
  firstHttpsLink,
  splitLinks,
  validateMessage,
} from './chatRules.js';

describe('containsLink', () => {
  it.each([
    'see https://evil.example/x',
    'http://x.io',
    'go to www.example.org',
    'visit example.com now',
    'free tokens at scam-site.xyz/claim',
  ])('finds a link in %j', (text) => {
    expect(containsLink(text)).toBe(true);
  });

  it.each(['hello everyone', 'GG, well played!', 'meet at 18:00 UTC', 'e.g. spring'])(
    'finds none in %j',
    (text) => {
      expect(containsLink(text)).toBe(false);
    }
  );
});

describe('splitLinks', () => {
  it('cuts out https links and keeps the rest as text', () => {
    expect(splitLinks('see https://seasonaltokens.org/ and more')).toEqual([
      { text: 'see ' },
      { link: 'https://seasonaltokens.org/' },
      { text: ' and more' },
    ]);
  });

  it('never makes a link of plain http', () => {
    expect(splitLinks('old http://example.com/')).toEqual([{ text: 'old http://example.com/' }]);
  });

  it('never makes a link of javascript: or bare domains', () => {
    expect(splitLinks('javascript:alert(1) example.com')).toEqual([
      { text: 'javascript:alert(1) example.com' },
    ]);
  });
});

describe('https-only links', () => {
  it('finds the first https link, the one a preview is made for', () => {
    expect(firstHttpsLink('a https://one.example/x b https://two.example/')).toBe(
      'https://one.example/x'
    );
    expect(firstHttpsLink('http://one.example/ only')).toBeNull();
  });

  it('spots plain http links, which are refused', () => {
    expect(containsPlainHttpLink('see HTTP://example.com')).toBe(true);
    expect(containsPlainHttpLink('see https://example.com')).toBe(false);
  });
});

describe('validateMessage', () => {
  it('refuses empty and too long messages', () => {
    expect(validateMessage('   ')).toMatch(/empty/);
    expect(validateMessage('x'.repeat(MESSAGE_MAX + 1))).toMatch(/longer/);
    expect(validateMessage('hi')).toBeNull();
  });
});
